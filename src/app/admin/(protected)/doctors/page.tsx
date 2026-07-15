import Link from "next/link";
import { getDoctors } from "@/lib/admin-data";

function onboardingLabel(status: string): string {
  return status.replaceAll("_", " ");
}

export default async function DoctorsPage() {
  const doctors = await getDoctors();

  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">
            Provider network
          </span>
          <h1>Doctors</h1>
          <p>
            Configure identity, billing rules,
            Telegram access and accounting
            delivery.
          </p>
        </div>

        <Link
          href="/admin/doctors/new"
          className="primary-button"
        >
          Add doctor
        </Link>
      </header>

      <section className="content-card">
        <div className="table-wrap">
          <table className="admin-table doctors-table">
            <thead>
              <tr>
                <th>Doctor</th>
                <th>Practice</th>
                <th>Billing basis</th>
                <th>Telegram</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {doctors.length ? (
                doctors.map((doctor) => {
                  const profile =
                    doctor.billing_profile ?? {};

                  return (
                    <tr key={doctor.id}>
                      <td>
                        <strong>
                          {doctor.full_name}
                        </strong>
                        <small>
                          {doctor.speciality ||
                            "Speciality not set"}
                        </small>
                      </td>
                      <td>
                        {doctor.practice_name ||
                          "Not set"}
                      </td>
                      <td>
                        {String(
                          profile.billing_basis ??
                            "per_consultation",
                        ).replaceAll("_", " ")}
                      </td>
                      <td>
                        <span
                          className={
                            doctor.telegram_user_id
                              ? "connection-pill connected"
                              : "connection-pill"
                          }
                        >
                          {doctor.telegram_user_id
                            ? "Linked"
                            : "Not linked"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`status-badge status-${doctor.onboarding_status}`}
                        >
                          {onboardingLabel(
                            doctor.onboarding_status,
                          )}
                        </span>
                      </td>
                      <td className="table-action">
                        <Link
                          href={`/admin/doctors/${doctor.id}`}
                        >
                          Manage
                        </Link>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="empty-cell"
                  >
                    No doctors have been added.
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
