import Link from "next/link";
import {
  getAdminDashboardData,
} from "@/lib/admin-data";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusClass(status: string): string {
  return `status-badge status-${status.replaceAll(
    "_",
    "-",
  )}`;
}

export default async function AdminDashboardPage() {
  const data = await getAdminDashboardData();

  const cards = [
    {
      label: "Doctors",
      value: data.counts.doctors,
      detail: `${data.counts.activeDoctors} active`,
    },
    {
      label: "Awaiting confirmation",
      value: data.counts.pending,
      detail: "Doctor action required",
    },
    {
      label: "Delivered",
      value: data.counts.sent,
      detail: "Billing emails sent",
    },
    {
      label: "Needs attention",
      value: data.counts.failed,
      detail: "Failed processing",
    },
  ];

  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">
            MFI operations
          </span>
          <h1>Billing control centre</h1>
          <p>
            Track consultation submissions,
            doctor onboarding and delivery
            performance.
          </p>
        </div>

        <Link
          href="/admin/doctors/new"
          className="primary-button"
        >
          Add doctor
        </Link>
      </header>

      <section className="metric-grid">
        {cards.map((card) => (
          <article
            className="metric-card"
            key={card.label}
          >
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.detail}</small>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="content-card wide-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">
                Live activity
              </span>
              <h2>Recent submissions</h2>
            </div>
          </div>

          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Doctor</th>
                  <th>Status</th>
                  <th>Received</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSubmissions.length ? (
                  data.recentSubmissions.map(
                    (submission) => (
                      <tr key={submission.id}>
                        <td>
                          <code>
                            {submission.reference}
                          </code>
                        </td>
                        <td>
                          {submission.doctorName}
                        </td>
                        <td>
                          <span
                            className={statusClass(
                              submission.status,
                            )}
                          >
                            {submission.status.replaceAll(
                              "_",
                              " ",
                            )}
                          </span>
                        </td>
                        <td>
                          {formatDate(
                            submission.created_at,
                          )}
                        </td>
                      </tr>
                    ),
                  )
                ) : (
                  <tr>
                    <td
                      colSpan={4}
                      className="empty-cell"
                    >
                      No consultations received yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <aside className="content-card action-card">
          <span className="eyebrow">
            Quick start
          </span>
          <h2>Onboard a doctor</h2>
          <ol className="step-list">
            <li>
              Create the doctor profile and rules.
            </li>
            <li>
              Send the secure invitation link.
            </li>
            <li>
              Doctor links Telegram.
            </li>
            <li>
              Run one test consultation.
            </li>
          </ol>
          <Link
            href="/admin/doctors/new"
            className="secondary-button full-button"
          >
            Start onboarding
          </Link>
        </aside>
      </section>
    </>
  );
}
