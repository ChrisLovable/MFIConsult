import Link from "next/link";
import { notFound } from "next/navigation";
import InvoicePrintButton from "./invoice-print-button";
import { getInvoiceDetail } from "@/lib/invoice-detail";

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

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const detail = await getInvoiceDetail(id);

  if (!detail) notFound();

  const { invoice, doctor, organisation, lines } = detail;

  return (
    <>
      <header className="page-header compact-header invoice-page-header">
        <div>
          <Link
            href={`/admin/doctors/${doctor.id}/financial`}
            className="back-link"
          >
            Back to financial dashboard
          </Link>
          <span className="eyebrow">MFI staff only</span>
          <h1>{invoice.invoiceNumber}</h1>
          <p>
            Draft invoice generated from the received consultation
            information.
          </p>
        </div>

        <div className="invoice-page-actions">
          <InvoicePrintButton />
          <Link
            href={`/admin/doctors/${doctor.id}/financial`}
            className="primary-button"
          >
            Doctor financials
          </Link>
        </div>
      </header>

      {query.created === "new" ? (
        <div className="success-banner page-banner">
          Draft invoice created successfully. Review it before issuing or
          sending.
        </div>
      ) : null}

      {query.created === "existing" ? (
        <div className="success-banner page-banner">
          This consultation was already invoiced. The existing invoice is
          shown below.
        </div>
      ) : null}

      <section className="content-card invoice-review-warning">
        <strong>Draft — staff review required</strong>
        <p>
          Confirm the patient reference, service date, tariff codes, payer and
          amounts before the invoice is issued externally.
        </p>
      </section>

      <article className="invoice-document">
        <header className="invoice-document-header">
          <div>
            <span className="invoice-brand-kicker">{organisation.name}</span>
            <h2>Invoice</h2>
            <p>Medical billing intelligence</p>
          </div>

          <div className="invoice-document-number">
            <span>Invoice number</span>
            <strong>{invoice.invoiceNumber}</strong>
            <b
              className={`status-badge status-${invoice.status.replaceAll(
                "_",
                "-",
              )}`}
            >
              {invoice.status.replaceAll("_", " ")}
            </b>
          </div>
        </header>

        <section className="invoice-address-grid">
          <div>
            <span>Billing account</span>
            <strong>{doctor.full_name}</strong>
            <p>{doctor.practice_name || "Practice not specified"}</p>
            {doctor.practice_number ? (
              <p>Practice number: {doctor.practice_number}</p>
            ) : null}
            {doctor.email ? <p>{doctor.email}</p> : null}
          </div>

          <div>
            <span>Payer</span>
            <strong>{invoice.payerName || "Not specified"}</strong>
            <p>Invoice date: {dateLabel(invoice.invoiceDate)}</p>
            <p>Due date: {dateLabel(invoice.dueDate)}</p>
          </div>
        </section>

        <div className="invoice-line-table-wrap">
          <table className="invoice-line-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Patient reference</th>
                <th>Description</th>
                <th>Tariff</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td>{dateLabel(line.serviceDate)}</td>
                  <td>{line.patientReference || "Not provided"}</td>
                  <td>{line.description}</td>
                  <td>{line.tariffCode || "—"}</td>
                  <td>{line.quantity}</td>
                  <td>{money(line.unitRate)}</td>
                  <td>
                    <strong>{money(line.lineTotal)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="invoice-total-section">
          <div className="invoice-notes">
            <span>Notes</span>
            <p>{invoice.notes || "No invoice notes were recorded."}</p>
          </div>

          <dl className="invoice-totals">
            <div>
              <dt>Total</dt>
              <dd>{money(invoice.totalAmount)}</dd>
            </div>
            <div>
              <dt>Paid</dt>
              <dd>{money(invoice.amountPaid)}</dd>
            </div>
            <div className="invoice-balance-row">
              <dt>Balance due</dt>
              <dd>{money(invoice.balanceDue)}</dd>
            </div>
          </dl>
        </section>

        <footer className="invoice-document-footer">
          <span>Created by {invoice.createdByEmail}</span>
          <span>
            This is an internal draft until reviewed and issued by MFI staff.
          </span>
        </footer>
      </article>
    </>
  );
}
