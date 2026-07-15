import { getSupabaseAdmin } from "@/lib/supabase-admin";

type AskIntent =
  | "doctors_billed_over"
  | "top_doctors_by_billed"
  | "highest_overdue"
  | "lowest_collection_rate"
  | "financial_summary"
  | "ready_to_invoice"
  | "needs_review"
  | "payer_outstanding"
  | "unsupported";

interface AskPlan {
  intent: AskIntent;
  from: string;
  to: string;
  threshold: number;
  limit: number;
  explanation: string;
}

interface ResultRow {
  [key: string]: string | number | null;
}

interface AnthropicResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  error?: {
    message?: string;
  };
}

interface InvoiceDb {
  doctor_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  payer_name: string | null;
  total_amount: number | string | null;
  amount_paid: number | string | null;
  balance_due: number | string | null;
}

interface SubmissionDb {
  doctor_id: string;
  reference: string;
  status: string;
  financial_status: string | null;
  extraction: unknown;
  billing_calculation: unknown;
  created_at: string;
}

interface DoctorDb {
  id: string;
  full_name: string;
  practice_name: string | null;
  speciality: string | null;
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

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function submissionAmount(value: unknown): number {
  const calculation = recordValue(value);
  const rows = Array.isArray(calculation.rows)
    ? calculation.rows
    : [];

  return rows.reduce((total, item) => {
    const row = recordValue(item);

    const direct =
      numberValue(row.amount) ||
      numberValue(row.line_total) ||
      numberValue(row.total);

    if (direct > 0) {
      return total + direct;
    }

    const quantity = numberValue(row.quantity) || 1;
    const rate =
      numberValue(row.rate) ||
      numberValue(row.unit_rate);

    return total + quantity * rate;
  }, 0);
}

function submissionNeedsReview(submission: SubmissionDb): boolean {
  if (["failed", "email_failed"].includes(submission.status)) {
    return true;
  }

  const extraction = recordValue(submission.extraction);

  const confidenceRaw =
    numberValue(extraction.confidence) ||
    numberValue(extraction.extraction_confidence) ||
    numberValue(extraction.confidence_percent);

  const confidence =
    confidenceRaw > 0 && confidenceRaw <= 1
      ? confidenceRaw * 100
      : confidenceRaw;

  const missing = Array.isArray(extraction.missing_information)
    ? extraction.missing_information.filter(Boolean)
    : [];

  return (
    (confidence > 0 && confidence < 80) ||
    missing.length > 0
  );
}

function southAfricanToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function currentMonthStart(): string {
  const today = southAfricanToday();
  return `${today.slice(0, 7)}-01`;
}

function validDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(
      new Date(`${value}T00:00:00+02:00`).getTime(),
    )
  );
}

function money(value: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 2,
  }).format(value);
}

async function callClaude(
  system: string,
  user: string,
  maxTokens = 800,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const model =
    process.env.ANTHROPIC_MODEL ||
    "claude-haiku-4-5-20251001";

  const response = await fetch(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0,
        system,
        messages: [
          {
            role: "user",
            content: user,
          },
        ],
      }),
      cache: "no-store",
    },
  );

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(
      `Anthropic request failed: ${response.status} ${raw.slice(
        0,
        300,
      )}`,
    );
  }

  const data = JSON.parse(raw) as AnthropicResponse;

  const text =
    data.content
      ?.filter((item) => item.type === "text")
      .map((item) => item.text || "")
      .join("\n")
      .trim() || "";

  if (!text) {
    throw new Error("Anthropic returned no answer.");
  }

  return text;
}

function parseJsonObject(text: string): Record<string, unknown> {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error("AI did not return a valid query plan.");
  }

  return JSON.parse(
    cleaned.slice(firstBrace, lastBrace + 1),
  ) as Record<string, unknown>;
}

async function createPlan(question: string): Promise<AskPlan> {
  const today = southAfricanToday();

  const system = `
You convert MFI Consult management questions into a strictly controlled
read-only financial query plan.

Today in South Africa is ${today}.

Return JSON only. Do not return SQL.

Allowed intents:
- doctors_billed_over
- top_doctors_by_billed
- highest_overdue
- lowest_collection_rate
- financial_summary
- ready_to_invoice
- needs_review
- payer_outstanding
- unsupported

Required JSON:
{
  "intent": "one allowed intent",
  "from": "YYYY-MM-DD",
  "to": "YYYY-MM-DD",
  "threshold": 0,
  "limit": 20,
  "explanation": "short interpretation"
}

Rules:
- Resolve relative dates such as last month or this quarter exactly.
- doctors_billed_over means total invoice value per doctor exceeds threshold.
- highest_overdue means open past-due balances.
- lowest_collection_rate means amount paid divided by amount invoiced.
- financial_summary compares invoiced, paid and outstanding amounts.
- ready_to_invoice concerns completed submissions not yet invoiced.
- needs_review concerns failed, incomplete or low-confidence submissions.
- payer_outstanding groups outstanding balances by payer.
- Never invent a new intent.
- Never provide SQL.
`.trim();

  const text = await callClaude(
    system,
    question,
    500,
  );

  const raw = parseJsonObject(text);

  const supported: AskIntent[] = [
    "doctors_billed_over",
    "top_doctors_by_billed",
    "highest_overdue",
    "lowest_collection_rate",
    "financial_summary",
    "ready_to_invoice",
    "needs_review",
    "payer_outstanding",
    "unsupported",
  ];

  const intent = supported.includes(raw.intent as AskIntent)
    ? (raw.intent as AskIntent)
    : "unsupported";

  const from = validDate(raw.from)
    ? raw.from
    : currentMonthStart();

  const to = validDate(raw.to)
    ? raw.to
    : today;

  return {
    intent,
    from: from <= to ? from : to,
    to: from <= to ? to : from,
    threshold: Math.max(
      0,
      Math.min(numberValue(raw.threshold), 1_000_000_000),
    ),
    limit: Math.max(
      1,
      Math.min(Math.round(numberValue(raw.limit) || 20), 50),
    ),
    explanation:
      typeof raw.explanation === "string"
        ? raw.explanation.slice(0, 250)
        : "The question was converted into a verified read-only query.",
  };
}

async function fetchInvoices(
  from: string,
  to: string,
): Promise<InvoiceDb[]> {
  const supabase = getSupabaseAdmin();
  const rows: InvoiceDb[] = [];
  const pageSize = 1000;

  for (let start = 0; start < 100000; start += pageSize) {
    const { data, error } = await supabase
      .from("consultbill_invoices")
      .select(
        "doctor_id,invoice_number,invoice_date,due_date,payer_name,total_amount,amount_paid,balance_due",
      )
      .gte("invoice_date", from)
      .lte("invoice_date", to)
      .range(start, start + pageSize - 1);

    if (error) {
      throw error;
    }

    const page = (data ?? []) as InvoiceDb[];
    rows.push(...page);

    if (page.length < pageSize) {
      break;
    }
  }

  return rows;
}

async function fetchSubmissions(
  from: string,
  to: string,
): Promise<SubmissionDb[]> {
  const supabase = getSupabaseAdmin();
  const rows: SubmissionDb[] = [];
  const pageSize = 1000;

  const startDate = new Date(
    `${from}T00:00:00+02:00`,
  ).toISOString();

  const endDate = new Date(
    new Date(`${to}T00:00:00+02:00`).getTime() +
      86400000,
  ).toISOString();

  for (let start = 0; start < 100000; start += pageSize) {
    const { data, error } = await supabase
      .from("consultbill_submissions")
      .select(
        "doctor_id,reference,status,financial_status,extraction,billing_calculation,created_at",
      )
      .gte("created_at", startDate)
      .lt("created_at", endDate)
      .range(start, start + pageSize - 1);

    if (error) {
      throw error;
    }

    const page = (data ?? []) as SubmissionDb[];
    rows.push(...page);

    if (page.length < pageSize) {
      break;
    }
  }

  return rows;
}

async function doctorMap(
  doctorIds: string[],
): Promise<Map<string, DoctorDb>> {
  const uniqueIds = [...new Set(doctorIds)].filter(Boolean);

  if (!uniqueIds.length) {
    return new Map();
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("consultbill_doctors")
    .select("id,full_name,practice_name,speciality")
    .in("id", uniqueIds);

  if (error) {
    throw error;
  }

  return new Map(
    ((data ?? []) as DoctorDb[]).map((doctor) => [
      doctor.id,
      doctor,
    ]),
  );
}

async function executePlan(plan: AskPlan): Promise<{
  rows: ResultRow[];
  totals: Record<string, number>;
}> {
  if (plan.intent === "unsupported") {
    return {
      rows: [],
      totals: {},
    };
  }

  if (
    [
      "doctors_billed_over",
      "top_doctors_by_billed",
      "highest_overdue",
      "lowest_collection_rate",
      "financial_summary",
      "payer_outstanding",
    ].includes(plan.intent)
  ) {
    const invoices = await fetchInvoices(plan.from, plan.to);

    const totalInvoiced = invoices.reduce(
      (total, invoice) =>
        total + numberValue(invoice.total_amount),
      0,
    );

    const totalPaid = invoices.reduce(
      (total, invoice) =>
        total + numberValue(invoice.amount_paid),
      0,
    );

    const totalOutstanding = invoices.reduce(
      (total, invoice) =>
        total + numberValue(invoice.balance_due),
      0,
    );

    if (plan.intent === "financial_summary") {
      return {
        rows: [
          {
            Period: `${plan.from} to ${plan.to}`,
            Invoiced: money(totalInvoiced),
            Paid: money(totalPaid),
            Outstanding: money(totalOutstanding),
            "Collection rate":
              totalInvoiced > 0
                ? `${(
                    (totalPaid / totalInvoiced) *
                    100
                  ).toFixed(1)}%`
                : "0.0%",
          },
        ],
        totals: {
          invoiced: totalInvoiced,
          paid: totalPaid,
          outstanding: totalOutstanding,
          invoiceCount: invoices.length,
        },
      };
    }

    if (plan.intent === "payer_outstanding") {
      const grouped = new Map<string, number>();

      for (const invoice of invoices) {
        const payer =
          invoice.payer_name?.trim() || "Unspecified payer";

        grouped.set(
          payer,
          (grouped.get(payer) || 0) +
            numberValue(invoice.balance_due),
        );
      }

      const rows = [...grouped.entries()]
        .filter(([, amount]) => amount > plan.threshold)
        .sort((a, b) => b[1] - a[1])
        .slice(0, plan.limit)
        .map(([payer, amount]) => ({
          Payer: payer,
          Outstanding: money(amount),
        }));

      return {
        rows,
        totals: {
          outstanding: totalOutstanding,
          matchingPayers: rows.length,
        },
      };
    }

    const grouped = new Map<
      string,
      {
        invoiced: number;
        paid: number;
        outstanding: number;
        overdue: number;
        invoiceCount: number;
      }
    >();

    const today = new Date(
      `${southAfricanToday()}T00:00:00+02:00`,
    ).getTime();

    for (const invoice of invoices) {
      const current = grouped.get(invoice.doctor_id) || {
        invoiced: 0,
        paid: 0,
        outstanding: 0,
        overdue: 0,
        invoiceCount: 0,
      };

      current.invoiced += numberValue(invoice.total_amount);
      current.paid += numberValue(invoice.amount_paid);
      current.outstanding += numberValue(invoice.balance_due);
      current.invoiceCount += 1;

      if (
        invoice.due_date &&
        new Date(
          `${invoice.due_date}T00:00:00+02:00`,
        ).getTime() < today
      ) {
        current.overdue += numberValue(invoice.balance_due);
      }

      grouped.set(invoice.doctor_id, current);
    }

    let ranked = [...grouped.entries()];

    if (plan.intent === "doctors_billed_over") {
      ranked = ranked
        .filter(([, value]) => value.invoiced > plan.threshold)
        .sort((a, b) => b[1].invoiced - a[1].invoiced);
    }

    if (plan.intent === "top_doctors_by_billed") {
      ranked = ranked.sort(
        (a, b) => b[1].invoiced - a[1].invoiced,
      );
    }

    if (plan.intent === "highest_overdue") {
      ranked = ranked
        .filter(([, value]) => value.overdue > plan.threshold)
        .sort((a, b) => b[1].overdue - a[1].overdue);
    }

    if (plan.intent === "lowest_collection_rate") {
      ranked = ranked
        .filter(([, value]) => value.invoiced > 0)
        .sort((a, b) => {
          const aRate = a[1].paid / a[1].invoiced;
          const bRate = b[1].paid / b[1].invoiced;
          return aRate - bRate;
        });
    }

    ranked = ranked.slice(0, plan.limit);

    const doctors = await doctorMap(
      ranked.map(([doctorId]) => doctorId),
    );

    const rows = ranked.map(([doctorId, value]) => {
      const doctor = doctors.get(doctorId);

      return {
        Doctor: doctor?.full_name || "Unknown doctor",
        Practice: doctor?.practice_name || "Not specified",
        Invoiced: money(value.invoiced),
        Paid: money(value.paid),
        Outstanding: money(value.outstanding),
        Overdue: money(value.overdue),
        "Collection rate":
          value.invoiced > 0
            ? `${(
                (value.paid / value.invoiced) *
                100
              ).toFixed(1)}%`
            : "0.0%",
        Invoices: value.invoiceCount,
      };
    });

    return {
      rows,
      totals: {
        invoiced: totalInvoiced,
        paid: totalPaid,
        outstanding: totalOutstanding,
        matchingDoctors: rows.length,
      },
    };
  }

  const submissions = await fetchSubmissions(
    plan.from,
    plan.to,
  );

  const grouped = new Map<
    string,
    {
      count: number;
      amount: number;
    }
  >();

  for (const submission of submissions) {
    const matches =
      plan.intent === "ready_to_invoice"
        ? submission.status === "email_sent" &&
          ["ready_to_invoice", "not_invoiced"].includes(
            submission.financial_status || "not_invoiced",
          )
        : submissionNeedsReview(submission);

    if (!matches) {
      continue;
    }

    const current = grouped.get(submission.doctor_id) || {
      count: 0,
      amount: 0,
    };

    current.count += 1;
    current.amount += submissionAmount(
      submission.billing_calculation,
    );

    grouped.set(submission.doctor_id, current);
  }

  const ranked = [...grouped.entries()]
    .filter(([, value]) => value.amount > plan.threshold)
    .sort((a, b) => {
      if (b[1].count !== a[1].count) {
        return b[1].count - a[1].count;
      }

      return b[1].amount - a[1].amount;
    })
    .slice(0, plan.limit);

  const doctors = await doctorMap(
    ranked.map(([doctorId]) => doctorId),
  );

  const rows = ranked.map(([doctorId, value]) => ({
    Doctor:
      doctors.get(doctorId)?.full_name || "Unknown doctor",
    Practice:
      doctors.get(doctorId)?.practice_name ||
      "Not specified",
    Records: value.count,
    Value: money(value.amount),
  }));

  return {
    rows,
    totals: {
      matchingDoctors: rows.length,
      matchingRecords: ranked.reduce(
        (total, [, value]) => total + value.count,
        0,
      ),
      value: ranked.reduce(
        (total, [, value]) => total + value.amount,
        0,
      ),
    },
  };
}

function fallbackAnswer(
  plan: AskPlan,
  rows: ResultRow[],
): string {
  if (plan.intent === "unsupported") {
    return "I could not map that question to a supported verified financial analysis. Try asking about billing, collections, overdue balances, payments, ready-to-invoice work or records requiring review.";
  }

  if (!rows.length) {
    return `No matching records were found for ${plan.from} to ${plan.to}.`;
  }

  return `${rows.length} matching result${
    rows.length === 1 ? "" : "s"
  } were found for ${plan.from} to ${plan.to}. The figures shown below were calculated directly from stored MFI records.`;
}

async function intelligentAnswer(
  question: string,
  plan: AskPlan,
  rows: ResultRow[],
  totals: Record<string, number>,
): Promise<string> {
  if (plan.intent === "unsupported") {
    return fallbackAnswer(plan, rows);
  }

  const facts = JSON.stringify({
    question,
    interpretedQuery: plan,
    verifiedTotals: totals,
    verifiedRows: rows.slice(0, 25),
  });

  try {
    return await callClaude(
      `
You are the MFI Consult financial intelligence analyst.

Write a concise and intelligent management answer based only on the
verified facts supplied.

Rules:
- Never invent a doctor, amount, date or percentage.
- State the date period.
- Clearly answer the user's question.
- Highlight the most important result.
- Mention when no records matched.
- Keep the answer under 180 words.
- Do not mention SQL, prompts or internal implementation.
`.trim(),
      facts,
      500,
    );
  } catch {
    return fallbackAnswer(plan, rows);
  }
}

export async function askMfi(question: string) {
  const plan = await createPlan(question);
  const result = await executePlan(plan);

  const answer = await intelligentAnswer(
    question,
    plan,
    result.rows,
    result.totals,
  );

  return {
    question,
    answer,
    plan,
    rows: result.rows,
    totals: result.totals,
    verifiedAt: new Date().toISOString(),
    verification:
      "All displayed names and financial figures were calculated from stored MFI Consult database records. AI interpreted the question and explained the verified result; it did not generate or execute unrestricted SQL.",
  };
}
