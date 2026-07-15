import { getDoctor, getMfiOrganisation } from "@/lib/admin-data";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function getInvoiceDetail(invoiceId: string) {
  const organisation = await getMfiOrganisation();
  const supabase = getSupabaseAdmin();

  const { data: invoice, error: invoiceError } = await supabase
    .from("consultbill_invoices")
    .select(`
      id,
      organisation_id,
      doctor_id,
      invoice_number,
      invoice_date,
      due_date,
      payer_name,
      status,
      currency,
      total_amount,
      amount_paid,
      balance_due,
      notes,
      created_by_email,
      created_at,
      updated_at
    `)
    .eq("id", invoiceId)
    .eq("organisation_id", organisation.id)
    .maybeSingle();

  if (invoiceError) throw invoiceError;
  if (!invoice) return null;

  const [doctor, lineResult] = await Promise.all([
    getDoctor(invoice.doctor_id),
    supabase
      .from("consultbill_invoice_lines")
      .select(`
        id,
        submission_id,
        service_date,
        patient_reference,
        description,
        tariff_code,
        quantity,
        unit_rate,
        line_total,
        metadata,
        created_at
      `)
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: true }),
  ]);

  if (lineResult.error) throw lineResult.error;
  if (!doctor) return null;

  return {
    invoice: {
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      invoiceDate: invoice.invoice_date,
      dueDate: invoice.due_date,
      payerName: invoice.payer_name,
      status: invoice.status,
      currency: invoice.currency,
      totalAmount: numberValue(invoice.total_amount),
      amountPaid: numberValue(invoice.amount_paid),
      balanceDue: numberValue(invoice.balance_due),
      notes: invoice.notes,
      createdByEmail: invoice.created_by_email,
      createdAt: invoice.created_at,
      updatedAt: invoice.updated_at,
    },
    doctor,
    organisation,
    lines: (lineResult.data ?? []).map((line) => ({
      id: line.id,
      submissionId: line.submission_id,
      serviceDate: line.service_date,
      patientReference: line.patient_reference,
      description: line.description,
      tariffCode: line.tariff_code,
      quantity: numberValue(line.quantity),
      unitRate: numberValue(line.unit_rate),
      lineTotal: numberValue(line.line_total),
      metadata: line.metadata,
    })),
  };
}
