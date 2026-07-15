import { getDoctor } from "@/lib/admin-data";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type JsonRecord = Record<string, unknown>;

export interface FinancialSubmission {
  id: string;
  reference: string;
  status: string;
  financialStatus: string;
  createdAt: string;
  serviceDate: string | null;
  patientReference: string | null;
  consultationType: string | null;
  confidence: number | null;
  missingInformation: string[];
  amount: number;
  needsReview: boolean;
}

export interface FinancialInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  payerName: string | null;
  status: string;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  createdAt: string;
}

export interface FinancialPayment {
  id: string;
  paymentDate: string;
  payerName: string | null;
  reference: string | null;
  amount: number;
  status: string;
  createdAt: string;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function recordValue(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(String).map((item) => item.trim()).filter(Boolean)
    : [];
}

function rowsFromCalculation(value: unknown): JsonRecord[] {
  const rows = recordValue(value).rows;
  return Array.isArray(rows)
    ? rows.map(recordValue).filter((row) => Object.keys(row).length)
    : [];
}

function rowAmount(row: JsonRecord): number {
  const direct =
    numberValue(row.amount) ||
    numberValue(row.Amount) ||
    numberValue(row.line_total) ||
    numberValue(row.total);

  if (direct > 0) {
    return direct;
  }

  const quantity =
    numberValue(row.quantity) ||
    numberValue(row.Quantity) ||
    1;

  const rate =
    numberValue(row.rate) ||
    numberValue(row.Rate) ||
    numberValue(row.unit_rate);

  return quantity * rate;
}

function submissionAmount(value: unknown): number {
  return rowsFromCalculation(value).reduce(
    (total, row) => total + rowAmount(row),
    0,
  );
}

function extractionConfidence(extraction: JsonRecord): number | null {
  for (const candidate of [
    extraction.confidence,
    extraction.extraction_confidence,
    extraction.confidence_percent,
  ]) {
    const parsed = numberValue(candidate);
    if (parsed > 0) {
      return parsed <= 1 ? Math.round(parsed * 100) : Math.round(parsed);
    }
  }

  return null;
}

function extractionMissing(extraction: JsonRecord): string[] {
  const values = [
    ...stringArray(extraction.missing_information),
    ...stringArray(extraction.missing_fields),
  ];

  return values.filter((value, index) => values.indexOf(value) === index);
}

function money(value: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 2,
  }).format(value);
}

export function defaultFinancialDates(): { from: string; to: string } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const today = formatter.format(now);
  const [year, month] = today.split("-");

  return {
    from: `${year}-${month}-01`,
    to: today,
  };
}

export async function getDoctorFinancialDashboard(
  doctorId: string,
  from: string,
  to: string,
) {
  const doctor = await getDoctor(doctorId);

  if (!doctor) {
    return null;
  }

  const supabase = getSupabaseAdmin();
  const start = new Date(
    `${from}T00:00:00+02:00`,
  ).toISOString();

  const end = new Date(
    new Date(`${to}T00:00:00+02:00`).getTime() + 86400000,
  ).toISOString();

  const [submissionResult, invoiceResult, paymentResult] =
    await Promise.all([
      supabase
        .from("consultbill_submissions")
        .select("id,reference,status,financial_status,extraction,billing_calculation,created_at")
        .eq("doctor_id", doctorId)
        .gte("created_at", start)
        .lt("created_at", end)
        .order("created_at", { ascending: false }),
      supabase
        .from("consultbill_invoices")
        .select("id,invoice_number,invoice_date,due_date,payer_name,status,total_amount,amount_paid,balance_due,created_at")
        .eq("doctor_id", doctorId)
        .gte("invoice_date", from)
        .lte("invoice_date", to)
        .order("invoice_date", { ascending: false }),
      supabase
        .from("consultbill_payments")
        .select("id,payment_date,payer_name,reference,amount,status,created_at")
        .eq("doctor_id", doctorId)
        .gte("payment_date", from)
        .lte("payment_date", to)
        .order("payment_date", { ascending: false })
        .limit(50),
    ]);

  if (submissionResult.error) throw submissionResult.error;
  if (invoiceResult.error) throw invoiceResult.error;
  if (paymentResult.error) throw paymentResult.error;

  const submissions: FinancialSubmission[] =
    (submissionResult.data ?? []).map((submission) => {
      const extraction = recordValue(submission.extraction);
      const confidence = extractionConfidence(extraction);
      const missingInformation = extractionMissing(extraction);

      return {
        id: submission.id,
        reference: submission.reference,
        status: submission.status,
        financialStatus: submission.financial_status ?? "not_invoiced",
        createdAt: submission.created_at,
        serviceDate: stringValue(extraction.consultation_date),
        patientReference: stringValue(extraction.patient_reference),
        consultationType:
          stringValue(extraction.consultation_type) ||
          stringValue(extraction.consultation),
        confidence,
        missingInformation,
        amount: submissionAmount(submission.billing_calculation),
        needsReview:
          ["failed", "email_failed"].includes(submission.status) ||
          (confidence !== null && confidence < 80) ||
          missingInformation.length > 0,
      };
    });

  const invoices: FinancialInvoice[] =
    (invoiceResult.data ?? []).map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      invoiceDate: invoice.invoice_date,
      dueDate: invoice.due_date,
      payerName: invoice.payer_name,
      status: invoice.status,
      totalAmount: numberValue(invoice.total_amount),
      amountPaid: numberValue(invoice.amount_paid),
      balanceDue: numberValue(invoice.balance_due),
      createdAt: invoice.created_at,
    }));

  const payments: FinancialPayment[] =
    (paymentResult.data ?? []).map((payment) => ({
      id: payment.id,
      paymentDate: payment.payment_date,
      payerName: payment.payer_name,
      reference: payment.reference,
      amount: numberValue(payment.amount),
      status: payment.status,
      createdAt: payment.created_at,
    }));

  const ready = submissions.filter(
    (submission) =>
      ["ready_to_invoice", "not_invoiced"].includes(
        submission.financialStatus,
      ) && submission.status === "email_sent",
  );

  const workRecorded = submissions.reduce(
    (total, submission) => total + submission.amount,
    0,
  );

  const readyToInvoiceAmount = ready.reduce(
    (total, submission) => total + submission.amount,
    0,
  );

  const invoiced = invoices.reduce(
    (total, invoice) => total + invoice.totalAmount,
    0,
  );

  const paid = invoices.reduce(
    (total, invoice) => total + invoice.amountPaid,
    0,
  );

  const outstanding = invoices.reduce(
    (total, invoice) => total + invoice.balanceDue,
    0,
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let overdue = 0;
  const aging = {
    current: 0,
    days1To30: 0,
    days31To60: 0,
    days61To90: 0,
    days90Plus: 0,
  };

  for (const invoice of invoices) {
    if (invoice.balanceDue <= 0) continue;

    const dueValue = invoice.dueDate ?? invoice.invoiceDate;
    const due = new Date(`${dueValue}T00:00:00`);
    const ageDays = Math.max(
      0,
      Math.floor((today.getTime() - due.getTime()) / 86400000),
    );

    if (invoice.dueDate && due.getTime() < today.getTime()) {
      overdue += invoice.balanceDue;
    }

    if (ageDays <= 0) aging.current += invoice.balanceDue;
    else if (ageDays <= 30) aging.days1To30 += invoice.balanceDue;
    else if (ageDays <= 60) aging.days31To60 += invoice.balanceDue;
    else if (ageDays <= 90) aging.days61To90 += invoice.balanceDue;
    else aging.days90Plus += invoice.balanceDue;
  }

  const reviewCount = submissions.filter(
    (submission) => submission.needsReview,
  ).length;

  const collectionRate = invoiced > 0 ? (paid / invoiced) * 100 : 0;

  const oldestOutstanding =
    invoices
      .filter((invoice) => invoice.balanceDue > 0)
      .sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate))[0] ??
    null;

  const summary: string[] = [
    `${doctor.full_name} has ${money(invoiced)} invoiced in the selected period, with ${money(paid)} received and ${money(outstanding)} still outstanding.`,
    ready.length
      ? `${ready.length} consultation${ready.length === 1 ? "" : "s"} ${ready.length === 1 ? "is" : "are"} ready to invoice${readyToInvoiceAmount > 0 ? `, worth approximately ${money(readyToInvoiceAmount)}` : ""}.`
      : "There are no completed consultations waiting to be invoiced in this period.",
  ];

  if (reviewCount > 0) {
    summary.push(
      `${reviewCount} record${reviewCount === 1 ? "" : "s"} need MFI staff review because information is missing, confidence is low, or processing failed.`,
    );
  }

  if (overdue > 0) {
    summary.push(
      `${money(overdue)} is overdue and should be prioritised for follow-up.${oldestOutstanding ? ` The oldest visible outstanding invoice is ${oldestOutstanding.invoiceNumber}.` : ""}`,
    );
  }

  if (invoiced > 0) {
    summary.push(
      `The collection rate for the selected period is ${collectionRate.toFixed(1)}%.`,
    );
  }

  return {
    doctor,
    from,
    to,
    metrics: {
      workRecorded,
      readyToInvoiceAmount,
      readyToInvoiceCount: ready.length,
      needsReviewCount: reviewCount,
      invoiced,
      paid,
      outstanding,
      overdue,
      collectionRate,
    },
    aging,
    submissions,
    invoices,
    payments,
    summary,
  };
}
