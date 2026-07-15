import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getDoctor, getMfiOrganisation } from "@/lib/admin-data";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(request: NextRequest) {
  const session = await requireAdminSession();
  const formData = await request.formData();

  const doctorId = text(formData, "doctor_id");
  const submissionId = text(formData, "submission_id");
  const invoiceNumber = text(formData, "invoice_number");
  const dueDate = text(formData, "due_date") || null;
  const amount = Number(text(formData, "amount"));
  const from = text(formData, "from");
  const to = text(formData, "to");

  const redirectUrl = new URL(
    `/admin/doctors/${doctorId}/financial`,
    request.url,
  );

  if (from) redirectUrl.searchParams.set("from", from);
  if (to) redirectUrl.searchParams.set("to", to);

  if (
    !doctorId ||
    !submissionId ||
    !invoiceNumber ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    redirectUrl.searchParams.set("error", "invoice");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const [doctor, organisation] = await Promise.all([
    getDoctor(doctorId),
    getMfiOrganisation(),
  ]);

  if (!doctor || doctor.organisation_id !== organisation.id) {
    redirectUrl.searchParams.set("error", "doctor");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const supabase = getSupabaseAdmin();

  const { data: submission, error: submissionError } =
    await supabase
      .from("consultbill_submissions")
      .select(
        "id,reference,organisation_id,doctor_id,status,financial_status,extraction,created_at",
      )
      .eq("id", submissionId)
      .eq("doctor_id", doctorId)
      .eq("organisation_id", organisation.id)
      .single();

  if (
    submissionError ||
    !submission ||
    submission.status !== "email_sent" ||
    !["ready_to_invoice", "not_invoiced"].includes(
      submission.financial_status,
    )
  ) {
    redirectUrl.searchParams.set("error", "submission");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const extraction = recordValue(submission.extraction);
  const serviceDate =
    typeof extraction.consultation_date === "string"
      ? extraction.consultation_date
      : submission.created_at.slice(0, 10);

  const patientReference =
    typeof extraction.patient_reference === "string"
      ? extraction.patient_reference
      : null;

  const description =
    (typeof extraction.consultation_type === "string" &&
      extraction.consultation_type) ||
    (typeof extraction.consultation === "string" &&
      extraction.consultation) ||
    "Consultation";

  const tariffCode =
    typeof extraction.tariff_code === "string"
      ? extraction.tariff_code
      : null;

  const { data: invoice, error: invoiceError } =
    await supabase
      .from("consultbill_invoices")
      .insert({
        organisation_id: organisation.id,
        doctor_id: doctorId,
        invoice_number: invoiceNumber,
        invoice_date: new Date().toISOString().slice(0, 10),
        due_date: dueDate,
        status: "issued",
        total_amount: amount,
        amount_paid: 0,
        balance_due: amount,
        created_by_email: session.email,
      })
      .select("id")
      .single();

  if (invoiceError || !invoice) {
    console.error("[MFI Financial] Invoice creation failed:", invoiceError);
    redirectUrl.searchParams.set("error", "invoice");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const { error: lineError } = await supabase
    .from("consultbill_invoice_lines")
    .insert({
      invoice_id: invoice.id,
      submission_id: submissionId,
      service_date: serviceDate,
      patient_reference: patientReference,
      description,
      tariff_code: tariffCode,
      quantity: 1,
      unit_rate: amount,
      line_total: amount,
      metadata: { consultation_reference: submission.reference },
    });

  if (lineError) {
    await supabase
      .from("consultbill_invoices")
      .delete()
      .eq("id", invoice.id);

    redirectUrl.searchParams.set("error", "line");
    return NextResponse.redirect(redirectUrl, 303);
  }

  await supabase
    .from("consultbill_submissions")
    .update({ financial_status: "invoiced" })
    .eq("id", submissionId);

  await supabase.from("consultbill_admin_audit").insert({
    organisation_id: organisation.id,
    actor_email: session.email,
    action: "invoice.created",
    entity_type: "invoice",
    entity_id: invoice.id,
    details: {
      doctor_id: doctorId,
      submission_id: submissionId,
      invoice_number: invoiceNumber,
      amount,
    },
  });

  redirectUrl.searchParams.set("saved", "invoice");
  return NextResponse.redirect(redirectUrl, 303);
}
