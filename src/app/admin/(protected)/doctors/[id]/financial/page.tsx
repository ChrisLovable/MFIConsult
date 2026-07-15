import Link from "next/link";
import FinancialPeriodFilter from "./financial-period-filter";
import { notFound } from "next/navigation";
import {
  defaultFinancialDates,
  getDoctorFinancialDashboard,
} from "@/lib/financial-intelligence";

export const dynamic = "force-dynamic";

function money(value: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 2,
  }).format(value);
}

function dateLabel(value: string | null): string {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export default async function DoctorFinancialPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    from?: string;
    to?: string;
    saved?: string;
    error?: string;
  }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const defaults = defaultFinancialDates();
  const from = query.from || defaults.from;
  const to = query.to || defaults.to;

  const dashboard = await getDoctorFinancialDashboard(id, from, to);
  if (!dashboard) notFound();

  const readySubmissions = dashboard.submissions.filter(
    (submission) =>
      submission.status === "email_sent" &&
      ["ready_to_invoice", "not_invoiced"].includes(
        submission.financialStatus,
      ),
  );

  const agingRows = [
    ["Current", dashboard.aging.current],
    ["1-30 days", dashboard.aging.days1To30],
    ["31-60 days", dashboard.aging.days31To60],
    ["61-90 days", dashboard.aging.days61To90],
    ["90+ days", dashboard.aging.days90Plus],
  ] as const;

  const maxAging = Math.max(1, ...agingRows.map((row) => row[1]));

  return (
    <>
      <header className="page-header compact-header">
        <div>
          <Link href={`/admin/doctors/${id}`} className="back-link">
            Back to doctor profile
          </Link>
          <span className="eyebrow">MFI staff only</span>
          <h1>{dashboard.doctor.full_name}</h1>
          <p>
            Financial intelligence, invoicing, payments and outstanding
            balances. This information is never visible to the doctor.
          </p>
        </div>

        <FinancialPeriodFilter
          doctorId={id}
          from={from}
          to={to}
        />
      </header>

      {query.saved ? (
        <div className="success-banner page-banner">
          Financial record saved successfully.
        </div>
      ) : null}

      {query.error ? (
        <div className="error-banner page-banner">
          The financial record could not be saved.
        </div>
      ) : null}

      <section className="financial-metric-grid">
        {[
          ["Work recorded", money(dashboard.metrics.workRecorded), "Recorded billing value"],
          ["Ready to invoice", String(dashboard.metrics.readyToInvoiceCount), money(dashboard.metrics.readyToInvoiceAmount)],
          ["Invoiced", money(dashboard.metrics.invoiced), "Issued in this period"],
          ["Paid", money(dashboard.metrics.paid), `${dashboard.metrics.collectionRate.toFixed(1)}% collection rate`],
          ["Outstanding", money(dashboard.metrics.outstanding), "Open invoice balances"],
          ["Overdue", money(dashboard.metrics.overdue), "Past due date"],
          ["Needs review", String(dashboard.metrics.needsReviewCount), "Missing or uncertain information"],
        ].map(([label, value, detail]) => (
          <article className="financial-metric-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </article>
        ))}
      </section>

      <section className="financial-layout">
        <article className="content-card financial-summary-card">
          <span className="eyebrow">Verified management summary</span>
          <h2>What MFI should know</h2>
          <div className="financial-summary-copy">
            {dashboard.summary.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <div className="summary-trust-note">
            All figures are calculated from stored submissions, invoices and
            payment allocations. No financial value is invented by AI.
          </div>
        </article>

        <article className="content-card aging-card">
          <span className="eyebrow">Outstanding aging</span>
          <h2>Balance by age</h2>
          <div className="aging-list">
            {agingRows.map(([label, value]) => (
              <div className="aging-row" key={label}>
                <div>
                  <span>{label}</span>
                  <strong>{money(value)}</strong>
                </div>
                <div className="aging-track">
                  <span
                    style={{
                      width: `${Math.max(
                        value > 0 ? 5 : 0,
                        (value / maxAging) * 100,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="content-card financial-section">
        <div className="card-heading financial-heading">
          <div>
            <span className="eyebrow">Work queue</span>
            <h2>Ready to invoice</h2>
          </div>
          <span className="count-pill">{readySubmissions.length}</span>
        </div>

        {readySubmissions.length ? (
          <div className="financial-record-list">
            {readySubmissions.map((submission) => (
              <article className="financial-record-card" key={submission.id}>
                <div className="financial-record-main">
                  <code>{submission.reference}</code>
                  <h3>{submission.consultationType || "Consultation"}</h3>
                  <div className="record-meta">
                    <span>
                      Patient ref: {submission.patientReference || "Not provided"}
                    </span>
                    <span>
                      Service date: {dateLabel(submission.serviceDate)}
                    </span>
                    <span>Extracted amount: {money(submission.amount)}</span>
                  </div>
                  {submission.needsReview ? (
                    <span className="review-warning">
                      MFI review recommended
                    </span>
                  ) : null}
                </div>

                <form
                  method="post"
                  action="/api/admin/financial/invoices"
                  className="invoice-create-form"
                >
                  <input type="hidden" name="doctor_id" value={id} />
                  <input
                    type="hidden"
                    name="submission_id"
                    value={submission.id}
                  />
                  <input type="hidden" name="from" value={from} />
                  <input type="hidden" name="to" value={to} />

                  <label>
                    <span>Invoice number</span>
                    <input
                      name="invoice_number"
                      required
                      placeholder="INV-1048"
                    />
                  </label>
                  <label>
                    <span>Invoice amount</span>
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      defaultValue={
                        submission.amount > 0 ? submission.amount : undefined
                      }
                      placeholder="850.00"
                    />
                  </label>
                  <label>
                    <span>Due date</span>
                    <input name="due_date" type="date" />
                  </label>
                  <button type="submit" className="primary-button">
                    Mark invoiced
                  </button>
                </form>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-financial-state">
            No completed consultations are waiting to be invoiced for this
            period.
          </div>
        )}
      </section>

      <section className="content-card financial-section">
        <div className="card-heading financial-heading">
          <div>
            <span className="eyebrow">Accounts receivable</span>
            <h2>Invoices and payments</h2>
          </div>
          <span className="count-pill">{dashboard.invoices.length}</span>
        </div>

        <div className="table-wrap">
          <table className="admin-table financial-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th>Status</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Record payment</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.invoices.length ? (
                dashboard.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <strong>{invoice.invoiceNumber}</strong>
                      <small>Due {dateLabel(invoice.dueDate)}</small>
                    </td>
                    <td>{dateLabel(invoice.invoiceDate)}</td>
                    <td>
                      <span
                        className={`status-badge status-${invoice.status.replaceAll(
                          "_",
                          "-",
                        )}`}
                      >
                        {invoice.status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td>{money(invoice.totalAmount)}</td>
                    <td>{money(invoice.amountPaid)}</td>
                    <td>
                      <strong>{money(invoice.balanceDue)}</strong>
                    </td>
                    <td>
                      {invoice.balanceDue > 0 ? (
                        <form
                          method="post"
                          action="/api/admin/financial/payments"
                          className="payment-inline-form"
                        >
                          <input type="hidden" name="doctor_id" value={id} />
                          <input
                            type="hidden"
                            name="invoice_id"
                            value={invoice.id}
                          />
                          <input type="hidden" name="from" value={from} />
                          <input type="hidden" name="to" value={to} />
                          <input
                            name="amount"
                            type="number"
                            min="0.01"
                            max={invoice.balanceDue}
                            step="0.01"
                            required
                            defaultValue={invoice.balanceDue}
                            aria-label="Payment amount"
                          />
                          <input
                            name="reference"
                            placeholder="Reference"
                            aria-label="Payment reference"
                          />
                          <button type="submit" className="secondary-button">
                            Save payment
                          </button>
                        </form>
                      ) : (
                        <span className="paid-label">Settled</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    No invoices have been recorded for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
