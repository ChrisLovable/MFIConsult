import Link from "next/link";
import CommandCentreRefresh from "./command-centre-refresh";
import {
  commandCentreChange,
  getDailyCommandCentre,
} from "@/lib/daily-command-centre";

export const dynamic = "force-dynamic";

function money(value: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value);
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusClass(status: string): string {
  return `status-badge status-${status.replaceAll("_", "-")}`;
}

function changeLabel(current: number, previous: number): string {
  const change = commandCentreChange(current, previous);
  if (change.percent === null) return current > 0 ? "New activity" : "No movement";
  if (change.amount === 0) return "Unchanged";
  return `${change.amount > 0 ? "up" : "down"} ${Math.abs(change.percent).toFixed(1)}%`;
}

export default async function AdminDashboardPage() {
  const data = await getDailyCommandCentre();
  const maxPayer = Math.max(1, ...data.topPayers.map((item) => item.outstanding));
  const maxDoctor = Math.max(1, ...data.topDoctors.map((item) => item.invoiced));

  const metrics = [
    ["Invoiced today", money(data.invoices.today), changeLabel(data.invoices.today, data.invoices.yesterday)],
    ["Paid today", money(data.payments.today), changeLabel(data.payments.today, data.payments.yesterday)],
    ["Outstanding", money(data.balances.outstanding), `${money(data.balances.overdue)} overdue`],
    ["Ready to invoice", data.submissions.readyToInvoice.toLocaleString("en-ZA"), "Completed consultations"],
    ["Needs review", data.submissions.needsReview.toLocaleString("en-ZA"), "Failed or incomplete records"],
    ["Active doctors", data.doctors.active.toLocaleString("en-ZA"), `${data.doctors.total} total profiles`],
  ];

  return (
    <>
      <header className="page-header command-centre-header">
        <div>
          <span className="eyebrow">MFI operations</span>
          <h1>Daily command centre</h1>
          <p>Verified billing, collection and exception intelligence calculated directly from MFI records.</p>
        </div>
        <div className="command-header-actions">
          <CommandCentreRefresh />
          <Link href="/admin/ask" className="secondary-button">Ask MFI</Link>
          <Link href="/admin/doctors/new" className="primary-button">Add doctor</Link>
        </div>
      </header>

      <section className="content-card command-brief-card">
        <div className="command-section-heading">
          <div>
            <span className="eyebrow">Verified morning brief</span>
            <h2>What MFI should know today</h2>
          </div>
          <span className="command-pill">Updated {dateTime(data.generatedAt)}</span>
        </div>
        <div className="command-brief-copy">
          {data.brief.map((paragraph, index) => (
            <p key={paragraph} className={index === 0 ? "command-brief-lead" : undefined}>{paragraph}</p>
          ))}
        </div>
        <div className="summary-trust-note">All figures are calculated from stored submissions, invoices and payments.</div>
      </section>

      <section className="command-metric-grid">
        {metrics.map(([label, value, detail]) => (
          <article className="command-metric-card" key={label}>
            <span>{label}</span><strong>{value}</strong><small>{detail}</small>
          </article>
        ))}
      </section>

      <section className="command-two-grid">
        <article className="content-card">
          <div className="command-section-heading">
            <div><span className="eyebrow">What changed since yesterday</span><h2>Daily movement</h2></div>
          </div>
          <div className="command-change-list">
            {[
              ["Consultations", data.submissions.today, data.submissions.yesterday, (v: number) => v.toLocaleString("en-ZA")],
              ["Invoices", data.invoices.today, data.invoices.yesterday, money],
              ["Payments", data.payments.today, data.payments.yesterday, money],
              ["New overdue", data.balances.newOverdue, 0, money],
            ].map(([label, current, previous, format]) => {
              const change = commandCentreChange(current as number, previous as number);
              return (
                <div className="command-change-row" key={label as string}>
                  <div><span>{label as string}</span><strong>{(format as (value: number) => string)(current as number)}</strong></div>
                  <div><small>Yesterday {(format as (value: number) => string)(previous as number)}</small><b>{change.amount > 0 ? "+" : ""}{(format as (value: number) => string)(change.amount)}</b></div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="content-card">
          <div className="command-section-heading">
            <div><span className="eyebrow">Comparable month-to-date</span><h2>Billing and collections</h2></div>
          </div>
          <div className="command-compare-list">
            {[
              ["Invoiced", data.invoices.currentMtd, data.invoices.previousMtd],
              ["Paid", data.payments.currentMtd, data.payments.previousMtd],
            ].map(([label, current, previous]) => {
              const maximum = Math.max(1, current as number, previous as number);
              return (
                <div className="command-compare-row" key={label as string}>
                  <div><strong>{label as string}</strong><span>{changeLabel(current as number, previous as number)}</span></div>
                  <label>Current <i style={{ width: `${((current as number) / maximum) * 100}%` }} /><b>{money(current as number)}</b></label>
                  <label>Previous <i style={{ width: `${((previous as number) / maximum) * 100}%` }} /><b>{money(previous as number)}</b></label>
                </div>
              );
            })}
          </div>
          <small className="command-note">Current: {data.currentMonthStart} to {data.today}. Previous: {data.previousMonthStart} to {data.previousCompareEnd}.</small>
        </article>
      </section>

      <section className="command-two-grid">
        <article className="content-card">
          <div className="command-section-heading"><div><span className="eyebrow">Prioritised attention queue</span><h2>What needs action</h2></div><span className="count-pill">{data.attention.length}</span></div>
          <div className="command-attention-list">
            {data.attention.length ? data.attention.map((item) => (
              <Link href={item.href} className={`command-attention-item priority-${item.priority}`} key={`${item.title}-${item.value}`}>
                <span>{item.priority}</span><div><strong>{item.title}</strong><small>{item.detail}</small></div><b>{item.value}</b>
              </Link>
            )) : <div className="empty-state">No urgent exceptions require attention.</div>}
          </div>
        </article>

        <article className="content-card">
          <div className="command-section-heading"><div><span className="eyebrow">Payer exposure</span><h2>Largest outstanding balances</h2></div></div>
          <div className="command-ranking-list">
            {data.topPayers.length ? data.topPayers.map((payer) => (
              <div className="command-ranking-row" key={payer.payer}>
                <div><strong>{payer.payer}</strong><small>{payer.invoiceCount} invoices · {payer.sharePercent.toFixed(1)}%</small></div>
                <i><em style={{ width: `${(payer.outstanding / maxPayer) * 100}%` }} /></i><b>{money(payer.outstanding)}</b>
              </div>
            )) : <div className="empty-state">No outstanding payer balances.</div>}
          </div>
          <Link href="/admin/ask" className="secondary-button full-button">Analyse payers in Ask MFI</Link>
        </article>
      </section>

      <section className="command-two-grid">
        <article className="content-card">
          <div className="command-section-heading"><div><span className="eyebrow">Month-to-date leaders</span><h2>Top billing doctors</h2></div></div>
          <div className="command-ranking-list">
            {data.topDoctors.length ? data.topDoctors.map((doctor) => (
              <Link href={`/admin/doctors/${doctor.doctorId}/financial`} className="command-ranking-row" key={doctor.doctorId}>
                <div><strong>{doctor.doctor}</strong><small>{doctor.practice || "Practice not specified"} · {doctor.invoiceCount} invoices</small></div>
                <i><em style={{ width: `${(doctor.invoiced / maxDoctor) * 100}%` }} /></i><b>{money(doctor.invoiced)}</b>
              </Link>
            )) : <div className="empty-state">No invoices were issued this month.</div>}
          </div>
        </article>

        <article className="content-card">
          <div className="command-section-heading"><div><span className="eyebrow">Safe anomaly detection</span><h2>Material doctor movements</h2></div></div>
          <div className="command-movement-list">
            {data.doctorMovements.length ? data.doctorMovements.slice(0, 6).map((movement) => (
              <Link href={`/admin/doctors/${movement.doctorId}/financial`} className="command-movement-row" key={movement.doctorId}>
                <div><strong>{movement.doctor}</strong><small>{money(movement.previousAmount)} → {money(movement.currentAmount)}</small></div>
                <b>{movement.changePercent === null ? "New" : `${movement.changePercent > 0 ? "+" : ""}${movement.changePercent.toFixed(1)}%`}</b>
              </Link>
            )) : <div className="empty-state">No material doctor movements detected.</div>}
          </div>
          <p className="command-note">Statistical exceptions for review, not allegations of error or misconduct.</p>
        </article>
      </section>

      <section className="content-card command-activity-card">
        <div className="command-section-heading"><div><span className="eyebrow">Live operational activity</span><h2>Recent submissions</h2></div></div>
        <div className="table-wrap"><table className="admin-table"><thead><tr><th>Reference</th><th>Doctor</th><th>Status</th><th>Received</th></tr></thead><tbody>
          {data.recentSubmissions.length ? data.recentSubmissions.map((submission) => (
            <tr key={submission.id}><td><code>{submission.reference}</code></td><td>{submission.doctor || "Unknown doctor"}</td><td><span className={statusClass(submission.status)}>{submission.status.replaceAll("_", " ")}</span></td><td>{dateTime(submission.createdAt)}</td></tr>
          )) : <tr><td colSpan={4} className="empty-cell">No consultations received yet.</td></tr>}
        </tbody></table></div>
      </section>
    </>
  );
}
