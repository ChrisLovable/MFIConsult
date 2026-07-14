import {
  billingExtractionSchema,
  type BillingExtraction,
} from "@/lib/billing-extraction";
import { sendBillingEmail } from "@/lib/email";
import { buildBillingWorkbook } from "@/lib/billing-workbook";
import { getServerEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  escapeTelegramHtml,
  sendTelegramMessage,
} from "@/lib/telegram";

interface BillingSubmission {
  id: string;
  reference: string;
  organisation_id: string;
  doctor_id: string;
  extraction: unknown;
  created_at: string;
}

interface DoctorRecord {
  id: string;
  organisation_id: string;
  full_name: string;
  practice_name: string | null;
  practice_number: string | null;
  email_recipient: string | null;
}

interface OrganisationRecord {
  id: string;
  name: string;
  default_accounting_email: string | null;
}

interface BillingRow {
  reference: string;
  doctor: string;
  practice: string;
  practiceNumber: string;
  patientReference: string;
  patientName: string;
  consultationDate: string;
  consultationTime: string;
  consultationType: string;
  durationMinutes: string;
  placeOfService: string;
  diagnosis: string;
  icd10: string;
  tariffCode: string;
  tariffDescription: string;
  procedure: string;
  quantity: string;
  rate: string;
  amount: string;
  medicalAid: string;
  authorisation: string;
  confirmedAt: string;
}

function normalizeCommand(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

export function isConfirmationText(value: string): boolean {
  return [
    "YES",
    "Y",
    "CONFIRM",
    "CONFIRMED",
    "/CONFIRM",
  ].includes(normalizeCommand(value));
}

export function isCancellationText(value: string): boolean {
  return [
    "NO",
    "N",
    "CANCEL",
    "CANCELLED",
    "/CANCEL",
  ].includes(normalizeCommand(value));
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatJohannesburgTimestamp(date = new Date()): string {
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date) + " SAST";
}

function buildBillingRows(
  submission: BillingSubmission,
  doctor: DoctorRecord,
  extraction: BillingExtraction,
  confirmedAt: string,
): BillingRow[] {
  const base = {
    reference: submission.reference,
    doctor: doctor.full_name,
    practice: doctor.practice_name ?? "",
    practiceNumber: doctor.practice_number ?? "",
    patientReference: extraction.patient_reference ?? "",
    patientName: extraction.patient_name ?? "",
    consultationDate: extraction.consultation_date ?? "",
    consultationTime: extraction.consultation_time ?? "",
    consultationType: extraction.consultation_type ?? "",
    durationMinutes:
      extraction.duration_minutes === null
        ? ""
        : String(extraction.duration_minutes),
    placeOfService: extraction.place_of_service ?? "",
    diagnosis: extraction.diagnosis_summary ?? "",
    icd10: extraction.icd10_codes
      .map((item) => item.code)
      .join("; "),
    medicalAid: extraction.medical_aid ?? "",
    authorisation: extraction.authorisation_number ?? "",
    confirmedAt,
  };

  if (extraction.tariff_codes.length) {
    return extraction.tariff_codes.map((tariff, index) => ({
      ...base,
      tariffCode: tariff.code,
      tariffDescription: tariff.description,
      procedure: extraction.procedures[index] ?? "",
      quantity: "1",
      rate: "",
      amount: "",
    }));
  }

  if (extraction.procedures.length) {
    return extraction.procedures.map((procedure) => ({
      ...base,
      tariffCode: "",
      tariffDescription: "",
      procedure,
      quantity: "1",
      rate: "",
      amount: "",
    }));
  }

  return [
    {
      ...base,
      tariffCode: "",
      tariffDescription: "",
      procedure: "",
      quantity: "1",
      rate: "",
      amount: "",
    },
  ];
}

const columns: Array<{
  header: string;
  key: keyof BillingRow;
}> = [
  { header: "Reference", key: "reference" },
  { header: "Doctor", key: "doctor" },
  { header: "Practice", key: "practice" },
  { header: "Practice Number", key: "practiceNumber" },
  { header: "Patient Reference", key: "patientReference" },
  { header: "Patient Name", key: "patientName" },
  { header: "Date", key: "consultationDate" },
  { header: "Time", key: "consultationTime" },
  { header: "Consultation Type", key: "consultationType" },
  { header: "Duration Minutes", key: "durationMinutes" },
  { header: "Place of Service", key: "placeOfService" },
  { header: "Diagnosis", key: "diagnosis" },
  { header: "ICD-10", key: "icd10" },
  { header: "Tariff Code", key: "tariffCode" },
  { header: "Tariff Description", key: "tariffDescription" },
  { header: "Procedure", key: "procedure" },
  { header: "Quantity", key: "quantity" },
  { header: "Rate", key: "rate" },
  { header: "Amount", key: "amount" },
  { header: "Medical Aid", key: "medicalAid" },
  { header: "Authorisation", key: "authorisation" },
  { header: "Confirmed At", key: "confirmedAt" },
];

function csvCell(value: unknown): string {
  const text = String(value ?? "")
    .replace(/\r?\n/g, " ")
    .trim();

  return `"${text.replaceAll('"', '""')}"`;
}

function buildCsv(rows: BillingRow[]): string {
  const header = columns
    .map((column) => csvCell(column.header))
    .join(",");

  const body = rows.map((row) =>
    columns
      .map((column) => csvCell(row[column.key]))
      .join(","),
  );

  return [header, ...body].join("\r\n");
}

function htmlEscape(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildHtml(
  submission: BillingSubmission,
  doctor: DoctorRecord,
  extraction: BillingExtraction,
  rows: BillingRow[],
): string {
  const headers = columns
    .map(
      (column) =>
        `<th style="border:1px solid #cbd5e1;padding:8px;background:#0f172a;color:#fff;text-align:left;white-space:nowrap">${htmlEscape(column.header)}</th>`,
    )
    .join("");

  const body = rows
    .map(
      (row) =>
        `<tr>${columns
          .map(
            (column) =>
              `<td style="border:1px solid #cbd5e1;padding:8px;vertical-align:top">${htmlEscape(row[column.key])}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");

  return `
<!doctype html>
<html>
  <body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a">
    <h2 style="margin-bottom:4px">MFI consultation billing instruction</h2>
    <p style="margin-top:0;color:#475569">
      Reference: <strong>${htmlEscape(submission.reference)}</strong>
    </p>

    <table style="border-collapse:collapse;margin-bottom:20px">
      <tr>
        <td style="padding:4px 14px 4px 0"><strong>Doctor</strong></td>
        <td>${htmlEscape(doctor.full_name)}</td>
      </tr>
      <tr>
        <td style="padding:4px 14px 4px 0"><strong>Patient reference</strong></td>
        <td>${htmlEscape(extraction.patient_reference ?? "")}</td>
      </tr>
      <tr>
        <td style="padding:4px 14px 4px 0"><strong>Consultation</strong></td>
        <td>${htmlEscape(extraction.consultation_type ?? "")}</td>
      </tr>
      <tr>
        <td style="padding:4px 14px 4px 0"><strong>Diagnosis</strong></td>
        <td>${htmlEscape(extraction.diagnosis_summary ?? "")}</td>
      </tr>
    </table>

    <p>
      The table below can be selected and copied directly into Excel.
      The same data is attached as a CSV file.
    </p>

    <div style="overflow-x:auto">
      <table style="border-collapse:collapse;font-size:13px">
        <thead><tr>${headers}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>

    <p style="margin-top:20px;color:#64748b;font-size:12px">
      This billing instruction was confirmed by the doctor through MFI Consult.
    </p>
  </body>
</html>
`.trim();
}

function buildPlainText(
  submission: BillingSubmission,
  doctor: DoctorRecord,
  extraction: BillingExtraction,
  rows: BillingRow[],
): string {
  return [
    "MFI CONSULTATION BILLING INSTRUCTION",
    "",
    `Reference: ${submission.reference}`,
    `Doctor: ${doctor.full_name}`,
    `Practice: ${doctor.practice_name ?? ""}`,
    `Patient reference: ${extraction.patient_reference ?? ""}`,
    `Consultation date: ${extraction.consultation_date ?? ""}`,
    `Consultation time: ${extraction.consultation_time ?? ""}`,
    `Consultation type: ${extraction.consultation_type ?? ""}`,
    `Duration: ${
      extraction.duration_minutes === null
        ? ""
        : `${extraction.duration_minutes} minutes`
    }`,
    `Diagnosis: ${extraction.diagnosis_summary ?? ""}`,
    `ICD-10: ${extraction.icd10_codes
      .map((item) => item.code)
      .join("; ")}`,
    `Tariff: ${extraction.tariff_codes
      .map((item) => item.code)
      .join("; ")}`,
    `Medical aid: ${extraction.medical_aid ?? ""}`,
    `Authorisation: ${extraction.authorisation_number ?? ""}`,
    "",
    `Excel rows included: ${rows.length}`,
    "A CSV file is attached.",
  ].join("\n");
}

function safeError(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 1000)
    : String(error).slice(0, 1000);
}

export async function confirmLatestBillingDraft(
  doctorId: string,
  chatId: number,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  let submissionId: string | null = null;
  let reference = "unknown";
  let recipient: string | null = null;

  try {
    const { data: submissionData, error: submissionError } =
      await supabase
        .from("consultbill_submissions")
        .select(`
          id,
          reference,
          organisation_id,
          doctor_id,
          extraction,
          created_at
        `)
        .eq("doctor_id", doctorId)
        .eq("telegram_chat_id", String(chatId))
        .eq("status", "needs_confirmation")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (submissionError) {
      throw submissionError;
    }

    if (!submissionData) {
      await sendTelegramMessage(
        chatId,
        "There is no billing draft waiting for confirmation.",
      );
      return;
    }

    const submission = submissionData as BillingSubmission;
    submissionId = submission.id;
    reference = submission.reference;

    const extraction = billingExtractionSchema.parse(
      submission.extraction,
    );

    const { data: doctorData, error: doctorError } =
      await supabase
        .from("consultbill_doctors")
        .select(`
          id,
          organisation_id,
          full_name,
          practice_name,
          practice_number,
          email_recipient
        `)
        .eq("id", doctorId)
        .single();

    if (doctorError) {
      throw doctorError;
    }

    const doctor = doctorData as DoctorRecord;

    const { data: organisationData, error: organisationError } =
      await supabase
        .from("consultbill_organisations")
        .select("id, name, default_accounting_email")
        .eq("id", submission.organisation_id)
        .single();

    if (organisationError) {
      throw organisationError;
    }

    const organisation =
      organisationData as OrganisationRecord;

    recipient =
      doctor.email_recipient ||
      organisation.default_accounting_email ||
      getServerEnv().ACCOUNTING_EMAIL;

    const confirmedAt = formatJohannesburgTimestamp();
    const rows = buildBillingRows(
      submission,
      doctor,
      extraction,
      confirmedAt,
    );

    const { data: claimed, error: claimError } = await supabase
      .from("consultbill_submissions")
      .update({
        status: "email_queued",
        doctor_confirmed_at: new Date().toISOString(),
        confirmed_extraction: extraction,
        billing_calculation: {
          rows,
          recipient,
        },
        error_message: null,
      })
      .eq("id", submission.id)
      .eq("status", "needs_confirmation")
      .select("id")
      .maybeSingle();

    if (claimError) {
      throw claimError;
    }

    if (!claimed) {
      await sendTelegramMessage(
        chatId,
        "This billing draft is already being processed.",
      );
      return;
    }

    const subject = [
      "MFI Billing",
      doctor.full_name,
      extraction.patient_reference || "Patient TBC",
      submission.reference,
    ].join(" | ");

    const csv = buildCsv(rows);
    const text = buildPlainText(
      submission,
      doctor,
      extraction,
      rows,
    );
    const html = buildHtml(
      submission,
      doctor,
      extraction,
      rows,
    );

    const { error: deliveryQueueError } = await supabase
      .from("consultbill_email_deliveries")
      .upsert(
        {
          submission_id: submission.id,
          organisation_id: submission.organisation_id,
          doctor_id: doctor.id,
          recipient,
          subject,
          status: "queued",
          error_message: null,
        },
        {
          onConflict: "submission_id",
        },
      );

    if (deliveryQueueError) {
      throw deliveryQueueError;
    }

    const xlsx = await buildBillingWorkbook({
      reference: submission.reference,
      doctor: doctor.full_name,
      practice: doctor.practice_name ?? "",
      patientReference: extraction.patient_reference ?? "",
      rows,
    });

    const result = await sendBillingEmail({
      to: recipient,
      subject,
      text,
      html,
      csvFilename: `${submission.reference}.csv`,
      csvContent: csv,
      xlsxFilename: `${submission.reference}.xlsx`,
      xlsxContent: xlsx,
    });

    const sentAt = new Date().toISOString();

    const { error: deliveryUpdateError } = await supabase
      .from("consultbill_email_deliveries")
      .update({
        status: "sent",
        smtp_message_id: result.messageId,
        accepted_recipients: result.accepted,
        rejected_recipients: result.rejected,
        sent_at: sentAt,
        error_message: null,
      })
      .eq("submission_id", submission.id);

    if (deliveryUpdateError) {
      throw deliveryUpdateError;
    }

    const { error: submissionUpdateError } = await supabase
      .from("consultbill_submissions")
      .update({
        status: "email_sent",
        email_sent_at: sentAt,
        error_message: null,
      })
      .eq("id", submission.id);

    if (submissionUpdateError) {
      throw submissionUpdateError;
    }

    await sendTelegramMessage(
      chatId,
      [
        "<b>Billing instruction sent</b>",
        "",
        `Reference: <code>${escapeTelegramHtml(submission.reference)}</code>`,
        `Recipient: ${escapeTelegramHtml(recipient)}`,
        "",
        "The email includes a copyable table, CSV attachment, and formatted Excel workbook.",
      ].join("\n"),
    );
  } catch (error) {
    const message = safeError(error);

    console.error(
      `[ConsultBill] Confirmation/email failed for ${reference}:`,
      message,
    );

    if (submissionId) {
      await supabase
        .from("consultbill_submissions")
        .update({
          status: "needs_confirmation",
          error_message: message,
        })
        .eq("id", submissionId);

      await supabase
        .from("consultbill_email_deliveries")
        .update({
          status: "failed",
          error_message: message,
        })
        .eq("submission_id", submissionId);
    }

    await sendTelegramMessage(
      chatId,
      [
        "<b>Email delivery failed</b>",
        `Reference: <code>${escapeTelegramHtml(reference)}</code>`,
        "",
        "The billing draft remains available.",
        "Check the email configuration, then reply CONFIRM to retry.",
      ].join("\n"),
    );
  }
}

export async function cancelLatestBillingDraft(
  doctorId: string,
  chatId: number,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: pending, error: pendingError } =
    await supabase
      .from("consultbill_submissions")
      .select("id, reference")
      .eq("doctor_id", doctorId)
      .eq("telegram_chat_id", String(chatId))
      .eq("status", "needs_confirmation")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (pendingError) {
    throw pendingError;
  }

  if (!pending) {
    await sendTelegramMessage(
      chatId,
      "There is no billing draft waiting to be cancelled.",
    );
    return;
  }

  const { error: cancelError } = await supabase
    .from("consultbill_submissions")
    .update({
      status: "cancelled",
      error_message: null,
    })
    .eq("id", pending.id)
    .eq("status", "needs_confirmation");

  if (cancelError) {
    throw cancelError;
  }

  await sendTelegramMessage(
    chatId,
    [
      "<b>Billing draft cancelled</b>",
      `Reference: <code>${escapeTelegramHtml(pending.reference)}</code>`,
    ].join("\n"),
  );
}

