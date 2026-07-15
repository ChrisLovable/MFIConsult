import { getSupabaseAdmin } from "@/lib/supabase-admin";

type JsonRecord = Record<string, unknown>;

export interface RecentInvoiceAction {
  id: string;
  reference: string;
  doctorId: string;
  doctor: string | null;
  status: string;
  createdAt: string;
  financialStatus: string;
  billableAmount: number;
  invoiceId: string | null;
  invoiceNumber: string | null;
}

interface RecentSubmissionBase {
  id: string;
  reference: string;
  doctorId: string;
  doctor: string | null;
  status: string;
  createdAt: string;
}

function recordValue(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function rowsFromCalculation(value: unknown): JsonRecord[] {
  const rows = recordValue(value).rows;
  return Array.isArray(rows)
    ? rows.map(recordValue).filter((row) => Object.keys(row).length)
    : [];
}

function rowAmount(row: JsonRecord): number {
  const direct =
    numberValue(row.line_total) ||
    numberValue(row.amount) ||
    numberValue(row.Amount) ||
    numberValue(row.total);

  if (direct > 0) return direct;

  const quantity =
    numberValue(row.quantity) || numberValue(row.Quantity) || 1;
  const rate =
    numberValue(row.unit_rate) ||
    numberValue(row.rate) ||
    numberValue(row.Rate);

  return quantity * rate;
}

function calculationAmount(value: unknown): number {
  const record = recordValue(value);
  const rowsTotal = rowsFromCalculation(value).reduce(
    (total, row) => total + rowAmount(row),
    0,
  );

  if (rowsTotal > 0) return rowsTotal;

  return (
    numberValue(record.total_amount) ||
    numberValue(record.grand_total) ||
    numberValue(record.total) ||
    numberValue(record.amount)
  );
}

export async function getRecentInvoiceActions(
  submissions: RecentSubmissionBase[],
): Promise<RecentInvoiceAction[]> {
  if (!submissions.length) return [];

  const ids = submissions.map((submission) => submission.id);
  const supabase = getSupabaseAdmin();

  const [submissionResult, linkResult] = await Promise.all([
    supabase
      .from("consultbill_submissions")
      .select("id,financial_status,billing_calculation")
      .in("id", ids),
    supabase
      .from("consultbill_submission_invoice_links")
      .select("submission_id,invoice_id")
      .in("submission_id", ids),
  ]);

  if (submissionResult.error) throw submissionResult.error;
  if (linkResult.error) throw linkResult.error;

  const financialMap = new Map<
    string,
    { financialStatus: string; billableAmount: number }
  >();

  for (const row of submissionResult.data ?? []) {
    financialMap.set(row.id, {
      financialStatus: row.financial_status ?? "not_invoiced",
      billableAmount: calculationAmount(row.billing_calculation),
    });
  }

  const invoiceLinkMap = new Map<string, string>();
  for (const link of linkResult.data ?? []) {
    invoiceLinkMap.set(link.submission_id, link.invoice_id);
  }

  const invoiceIds = Array.from(new Set(invoiceLinkMap.values()));
  const invoiceNumberMap = new Map<string, string>();

  if (invoiceIds.length) {
    const invoiceResult = await supabase
      .from("consultbill_invoices")
      .select("id,invoice_number")
      .in("id", invoiceIds);

    if (invoiceResult.error) throw invoiceResult.error;

    for (const invoice of invoiceResult.data ?? []) {
      invoiceNumberMap.set(invoice.id, invoice.invoice_number);
    }
  }

  return submissions.map((submission) => {
    const financial = financialMap.get(submission.id);
    const invoiceId = invoiceLinkMap.get(submission.id) ?? null;

    return {
      ...submission,
      financialStatus: financial?.financialStatus ?? "not_invoiced",
      billableAmount: financial?.billableAmount ?? 0,
      invoiceId,
      invoiceNumber: invoiceId
        ? invoiceNumberMap.get(invoiceId) ?? null
        : null,
    };
  });
}
