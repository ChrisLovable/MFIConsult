import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getMfiOrganisation } from "@/lib/admin-data";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function recordValue(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function safeReturnPath(value: string): string {
  if (
    value.startsWith("/admin") &&
    !value.startsWith("//") &&
    !value.includes("://")
  ) {
    return value;
  }

  return "/admin";
}

function errorCode(message: string): string {
  if (message.includes("NO_BILLABLE_AMOUNT")) return "amount";
  if (message.includes("SUBMISSION_NOT_READY")) return "not-ready";
  if (message.includes("SUBMISSION_NOT_FOUND")) return "missing";
  return "create";
}

export async function POST(request: NextRequest) {
  const session = await requireAdminSession();
  const formData = await request.formData();
  const submissionId = text(formData, "submission_id");
  const returnTo = safeReturnPath(text(formData, "return_to"));

  if (!submissionId) {
    const failure = new URL(returnTo, request.url);
    failure.searchParams.set("invoice_error", "missing");
    return NextResponse.redirect(failure, 303);
  }

  const organisation = await getMfiOrganisation();
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc(
    "consultbill_create_instant_invoice",
    {
      p_organisation_id: organisation.id,
      p_submission_id: submissionId,
      p_actor_email: session.email,
      p_due_days: 30,
    },
  );

  if (error) {
    console.error("[MFI Instant Invoice] Creation failed:", error);
    const failure = new URL(returnTo, request.url);
    failure.searchParams.set("invoice_error", errorCode(error.message));
    return NextResponse.redirect(failure, 303);
  }

  const result = recordValue(data);
  const invoiceId =
    typeof result.invoiceId === "string" ? result.invoiceId : "";

  if (!invoiceId) {
    const failure = new URL(returnTo, request.url);
    failure.searchParams.set("invoice_error", "create");
    return NextResponse.redirect(failure, 303);
  }

  const success = new URL(
    `/admin/invoices/${encodeURIComponent(invoiceId)}`,
    request.url,
  );

  success.searchParams.set(
    "created",
    result.alreadyExists === true ? "existing" : "new",
  );

  return NextResponse.redirect(success, 303);
}
