import { getMfiOrganisation } from "@/lib/admin-data";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type UnknownRecord = Record<string, unknown>;

export interface DailyCommandCentre {
  generatedAt: string;
  today: string;
  yesterday: string;
  currentMonthStart: string;
  previousMonthStart: string;
  previousCompareEnd: string;
  doctors: { total: number; active: number };
  submissions: {
    today: number;
    yesterday: number;
    readyToInvoice: number;
    needsReview: number;
  };
  invoices: {
    today: number;
    yesterday: number;
    currentMtd: number;
    previousMtd: number;
  };
  payments: {
    today: number;
    yesterday: number;
    currentMtd: number;
    previousMtd: number;
  };
  balances: {
    outstanding: number;
    overdue: number;
    newOverdue: number;
  };
  topPayers: Array<{
    payer: string;
    outstanding: number;
    invoiceCount: number;
    sharePercent: number;
  }>;
  topDoctors: Array<{
    doctorId: string;
    doctor: string;
    practice: string | null;
    invoiced: number;
    invoiceCount: number;
  }>;
  doctorMovements: Array<{
    doctorId: string;
    doctor: string;
    practice: string | null;
    currentAmount: number;
    previousAmount: number;
    changeAmount: number;
    changePercent: number | null;
  }>;
  recentSubmissions: Array<{
    id: string;
    reference: string;
    doctorId: string;
    doctor: string | null;
    status: string;
    createdAt: string;
  }>;
  brief: string[];
  attention: Array<{
    priority: "urgent" | "high" | "normal";
    title: string;
    detail: string;
    value: string;
    href: string;
  }>;
}

function recordValue(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function arrayValue(value: unknown): UnknownRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is UnknownRecord =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function money(value: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value);
}

function buildBrief(data: Omit<DailyCommandCentre, "brief" | "attention">): string[] {
  const first = `Today MFI received ${data.submissions.today.toLocaleString(
    "en-ZA",
  )} consultation submission${data.submissions.today === 1 ? "" : "s"}, issued ${money(
    data.invoices.today,
  )} in invoices and recorded ${money(data.payments.today)} in payments.`;

  const second = `Across all open invoices, ${money(
    data.balances.outstanding,
  )} remains outstanding, including ${money(data.balances.overdue)} that is overdue.`;

  const priorities: string[] = [];
  if (data.submissions.readyToInvoice > 0) {
    priorities.push(
      `${data.submissions.readyToInvoice.toLocaleString("en-ZA")} consultations are ready to invoice`,
    );
  }
  if (data.submissions.needsReview > 0) {
    priorities.push(
      `${data.submissions.needsReview.toLocaleString("en-ZA")} records need review`,
    );
  }
  if (data.topPayers[0]) {
    priorities.push(
      `${data.topPayers[0].payer} is the largest outstanding payer at ${money(
        data.topPayers[0].outstanding,
      )}`,
    );
  }

  return [
    first,
    second,
    priorities.length
      ? `Current priorities: ${priorities.join("; ")}.`
      : "There are no immediate billing or review exceptions requiring attention.",
  ];
}

function buildAttention(
  data: Omit<DailyCommandCentre, "brief" | "attention">,
): DailyCommandCentre["attention"] {
  const items: DailyCommandCentre["attention"] = [];

  if (data.balances.overdue > 0) {
    items.push({
      priority: "urgent",
      title: "Overdue balances require collection action",
      detail:
        data.balances.newOverdue > 0
          ? `${money(data.balances.newOverdue)} became overdue since yesterday.`
          : "Open invoices remain past their due dates.",
      value: money(data.balances.overdue),
      href: "/admin/ask",
    });
  }

  if (data.submissions.readyToInvoice > 0) {
    items.push({
      priority: "high",
      title: "Completed work is waiting to be invoiced",
      detail: `${data.submissions.readyToInvoice.toLocaleString(
        "en-ZA",
      )} consultation records are ready for billing.`,
      value: String(data.submissions.readyToInvoice),
      href: "/admin/doctors",
    });
  }

  if (data.submissions.needsReview > 0) {
    items.push({
      priority: "high",
      title: "Submission records need MFI review",
      detail: "These records failed processing or contain missing information.",
      value: String(data.submissions.needsReview),
      href: "/admin/doctors",
    });
  }

  const gap = data.invoices.currentMtd - data.payments.currentMtd;
  if (gap > 5000) {
    items.push({
      priority: "high",
      title: "Invoicing is ahead of collections",
      detail: "Monitor high-value outstanding payers and collection timing.",
      value: money(gap),
      href: "/admin/ask",
    });
  }

  const topPayer = data.topPayers[0];
  if (topPayer && data.balances.outstanding > 0) {
    const share = (topPayer.outstanding / data.balances.outstanding) * 100;
    if (share >= 35) {
      items.push({
        priority: "normal",
        title: "Outstanding balance is concentrated with one payer",
        detail: `${topPayer.payer} represents ${share.toFixed(
          1,
        )}% of the current outstanding portfolio.`,
        value: money(topPayer.outstanding),
        href: "/admin/ask",
      });
    }
  }

  const unusual = data.doctorMovements.find(
    (movement) =>
      movement.previousAmount >= 5000 &&
      movement.changePercent !== null &&
      Math.abs(movement.changePercent) >= 40,
  );

  if (unusual) {
    items.push({
      priority: unusual.changeAmount < 0 ? "high" : "normal",
      title: `${unusual.doctor} billing changed materially`,
      detail: `Comparable month-to-date billing moved by ${Math.abs(
        unusual.changePercent ?? 0,
      ).toFixed(1)}%.`,
      value: money(unusual.changeAmount),
      href: `/admin/doctors/${encodeURIComponent(unusual.doctorId)}/financial`,
    });
  }

  return items.slice(0, 6);
}

export function commandCentreChange(current: number, previous: number) {
  return {
    amount: current - previous,
    percent:
      previous > 0 ? ((current - previous) / previous) * 100 : null,
  };
}

export async function getDailyCommandCentre(): Promise<DailyCommandCentre> {
  const organisation = await getMfiOrganisation();
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc(
    "consultbill_daily_command_centre",
    { p_organisation_id: organisation.id },
  );

  if (error) throw error;

  const root = recordValue(data);
  const doctors = recordValue(root.doctors);
  const submissions = recordValue(root.submissions);
  const invoices = recordValue(root.invoices);
  const payments = recordValue(root.payments);
  const balances = recordValue(root.balances);

  const base: Omit<DailyCommandCentre, "brief" | "attention"> = {
    generatedAt: stringValue(root.generatedAt),
    today: stringValue(root.today),
    yesterday: stringValue(root.yesterday),
    currentMonthStart: stringValue(root.currentMonthStart),
    previousMonthStart: stringValue(root.previousMonthStart),
    previousCompareEnd: stringValue(root.previousCompareEnd),
    doctors: {
      total: numberValue(doctors.total),
      active: numberValue(doctors.active),
    },
    submissions: {
      today: numberValue(submissions.today),
      yesterday: numberValue(submissions.yesterday),
      readyToInvoice: numberValue(submissions.readyToInvoice),
      needsReview: numberValue(submissions.needsReview),
    },
    invoices: {
      today: numberValue(invoices.today),
      yesterday: numberValue(invoices.yesterday),
      currentMtd: numberValue(invoices.currentMtd),
      previousMtd: numberValue(invoices.previousMtd),
    },
    payments: {
      today: numberValue(payments.today),
      yesterday: numberValue(payments.yesterday),
      currentMtd: numberValue(payments.currentMtd),
      previousMtd: numberValue(payments.previousMtd),
    },
    balances: {
      outstanding: numberValue(balances.outstanding),
      overdue: numberValue(balances.overdue),
      newOverdue: numberValue(balances.newOverdue),
    },
    topPayers: arrayValue(root.topPayers).map((item) => ({
      payer: stringValue(item.payer),
      outstanding: numberValue(item.outstanding),
      invoiceCount: numberValue(item.invoice_count),
      sharePercent: 0,
    })),
    topDoctors: arrayValue(root.topDoctors).map((item) => ({
      doctorId: stringValue(item.doctor_id),
      doctor: stringValue(item.doctor),
      practice: stringValue(item.practice) || null,
      invoiced: numberValue(item.invoiced),
      invoiceCount: numberValue(item.invoice_count),
    })),
    doctorMovements: arrayValue(root.doctorMovements).map((item) => ({
      doctorId: stringValue(item.doctor_id),
      doctor: stringValue(item.doctor),
      practice: stringValue(item.practice) || null,
      currentAmount: numberValue(item.current_amount),
      previousAmount: numberValue(item.previous_amount),
      changeAmount: numberValue(item.change_amount),
      changePercent:
        item.change_percent === null || item.change_percent === undefined
          ? null
          : numberValue(item.change_percent),
    })),
    recentSubmissions: arrayValue(root.recentSubmissions).map((item) => ({
      id: stringValue(item.id),
      reference: stringValue(item.reference),
      doctorId: stringValue(item.doctor_id),
      doctor: stringValue(item.doctor) || null,
      status: stringValue(item.status),
      createdAt: stringValue(item.created_at),
    })),
  };

  if (base.balances.outstanding > 0) {
    base.topPayers = base.topPayers.map((payer) => ({
      ...payer,
      sharePercent: (payer.outstanding / base.balances.outstanding) * 100,
    }));
  }

  return {
    ...base,
    brief: buildBrief(base),
    attention: buildAttention(base),
  };
}
