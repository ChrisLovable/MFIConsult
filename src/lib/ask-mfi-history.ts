import { getSupabaseAdmin } from "@/lib/supabase-admin";

export interface AskThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AskStoredMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  plan: Record<string, unknown> | null;
  rows: Array<Record<string, string | number | null>>;
  totals: Record<string, number>;
  verification: string | null;
  createdAt: string;
}

interface StoredThreadRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface StoredMessageRow {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  plan: Record<string, unknown> | null;
  result_rows: unknown;
  totals: unknown;
  verification: string | null;
  created_at: string;
}

function safeRows(
  value: unknown,
): Array<Record<string, string | number | null>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is Record<string, string | number | null> =>
      Boolean(item) &&
      typeof item === "object" &&
      !Array.isArray(item),
  );
}

function safeTotals(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, raw]) => [key, Number(raw)])
      .filter(([, number]) => Number.isFinite(number)),
  ) as Record<string, number>;
}

function threadFromRow(row: StoredThreadRow): AskThread {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function messageFromRow(row: StoredMessageRow): AskStoredMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    content: row.content,
    plan: row.plan,
    rows: safeRows(row.result_rows),
    totals: safeTotals(row.totals),
    verification: row.verification,
    createdAt: row.created_at,
  };
}

export function validAskThreadId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export async function createAskThread(
  firstQuestion: string,
): Promise<AskThread> {
  const supabase = getSupabaseAdmin();

  const title =
    firstQuestion.replace(/\s+/g, " ").trim().slice(0, 78) ||
    "New MFI analysis";

  const { data, error } = await supabase
    .from("consultbill_ask_threads")
    .insert({ title })
    .select("id,title,created_at,updated_at")
    .single();

  if (error) {
    throw error;
  }

  return threadFromRow(data as StoredThreadRow);
}

export async function listAskThreads(
  limit = 30,
): Promise<AskThread[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("consultbill_ask_threads")
    .select("id,title,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 50)));

  if (error) {
    throw error;
  }

  return ((data ?? []) as StoredThreadRow[]).map(threadFromRow);
}

export async function getAskThread(
  threadId: string,
): Promise<AskThread | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("consultbill_ask_threads")
    .select("id,title,created_at,updated_at")
    .eq("id", threadId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? threadFromRow(data as StoredThreadRow) : null;
}

export async function getAskMessages(
  threadId: string,
  limit = 100,
): Promise<AskStoredMessage[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("consultbill_ask_messages")
    .select(
      "id,thread_id,role,content,plan,result_rows,totals,verification,created_at",
    )
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 200)));

  if (error) {
    throw error;
  }

  return ((data ?? []) as StoredMessageRow[]).map(messageFromRow);
}

export async function saveAskMessage(input: {
  threadId: string;
  role: "user" | "assistant";
  content: string;
  plan?: Record<string, unknown> | null;
  rows?: Array<Record<string, string | number | null>>;
  totals?: Record<string, number>;
  verification?: string | null;
}): Promise<AskStoredMessage> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("consultbill_ask_messages")
    .insert({
      thread_id: input.threadId,
      role: input.role,
      content: input.content,
      plan: input.plan ?? null,
      result_rows: input.rows ?? [],
      totals: input.totals ?? {},
      verification: input.verification ?? null,
    })
    .select(
      "id,thread_id,role,content,plan,result_rows,totals,verification,created_at",
    )
    .single();

  if (error) {
    throw error;
  }

  const { error: updateError } = await supabase
    .from("consultbill_ask_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", input.threadId);

  if (updateError) {
    throw updateError;
  }

  return messageFromRow(data as StoredMessageRow);
}

export async function saveAskAudit(input: {
  threadId: string | null;
  question: string;
  intent?: string | null;
  from?: string | null;
  to?: string | null;
  threshold?: number | null;
  resultCount?: number;
  status: "completed" | "failed";
  durationMs: number;
  errorMessage?: string | null;
}): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("consultbill_ask_audit")
    .insert({
      thread_id: input.threadId,
      question: input.question,
      intent: input.intent ?? null,
      date_from: input.from ?? null,
      date_to: input.to ?? null,
      threshold: input.threshold ?? null,
      result_count: input.resultCount ?? 0,
      status: input.status,
      duration_ms: input.durationMs,
      error_message: input.errorMessage?.slice(0, 1000) ?? null,
    });

  if (error) {
    throw error;
  }
}
