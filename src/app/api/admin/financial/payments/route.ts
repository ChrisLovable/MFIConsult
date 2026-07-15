import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getDoctor, getMfiOrganisation } from "@/lib/admin-data";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

export async function POST(request: NextRequest) {
  const session = await requireAdminSession();
  const formData = await request.formData();

  const doctorId = text(formData, "doctor_id");
  const invoiceId = text(formData, "invoice_id");
  const reference = text(formData, "reference") || null;
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
    !invoiceId ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    redirectUrl.searchParams.set("error", "payment");
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

  const { data: invoice, error: invoiceError } =
    await supabase
      .from("consultbill_invoices")
      .select("id,balance_due,payer_name")
      .eq("id", invoiceId)
      .eq("doctor_id", doctorId)
      .eq("organisation_id", organisation.id)
      .single();

  if (
    invoiceError ||
    !invoice ||
    amount > Number(invoice.balance_due)
  ) {
    redirectUrl.searchParams.set("error", "payment");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const { data: payment, error: paymentError } =
    await supabase
      .from("consultbill_payments")
      .insert({
        organisation_id: organisation.id,
        doctor_id: doctorId,
        payment_date: new Date().toISOString().slice(0, 10),
        payer_name: invoice.payer_name,
        reference,
        amount,
        status: "unallocated",
        created_by_email: session.email,
      })
      .select("id")
      .single();

  if (paymentError || !payment) {
    redirectUrl.searchParams.set("error", "payment");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const { error: allocationError } = await supabase
    .from("consultbill_payment_allocations")
    .insert({
      payment_id: payment.id,
      invoice_id: invoiceId,
      amount,
    });

  if (allocationError) {
    await supabase
      .from("consultbill_payments")
      .delete()
      .eq("id", payment.id);

    redirectUrl.searchParams.set("error", "allocation");
    return NextResponse.redirect(redirectUrl, 303);
  }

  await supabase.from("consultbill_admin_audit").insert({
    organisation_id: organisation.id,
    actor_email: session.email,
    action: "payment.recorded",
    entity_type: "payment",
    entity_id: payment.id,
    details: {
      doctor_id: doctorId,
      invoice_id: invoiceId,
      amount,
      reference,
    },
  });

  redirectUrl.searchParams.set("saved", "payment");
  return NextResponse.redirect(redirectUrl, 303);
}
