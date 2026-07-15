import Link from "next/link";
import { getDoctors } from "@/lib/admin-data";

function onboardingLabel(status: string): string {
  return status.replaceAll("_", " ");
}

export default async function DoctorsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
  }>;
}) {
  const doctors = await getDoctors();
  const params = await searchParams;

  const query = (params.q ?? "").trim();
  const normalisedQuery = query.toLowerCase();

  const filteredDoctors = normalisedQuery
    ? doctors.filter((doctor) => {
        const searchableDoctor = doctor as typeof doctor & {
          email?: string | null;
          mobile?: string | null;
          mobile_number?: string | null;
        };

        const searchableValues = [
          doctor.full_name,
          doctor.practice_name,
          doctor.speciality,
          searchableDoctor.email,
          searchableDoctor.mobile,
          searchableDoctor.mobile_number,
        ];

        return searchableValues.some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(normalisedQuery),
        );
      })
    : doctors;

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

      <section className="doctor-search-card">
        <form
          method="get"
          action="/admin/doctors"
          className="doctor-search-form"
        >
          <div className="doctor-search-copy">
            <label htmlFor="doctor-search">
              Search doctors
            </label>

            <small>
              Search by doctor, practice,
              speciality, email or mobile number.
            </small>
          </div>

          <div className="doctor-search-controls">
            <input
              id="doctor-search"
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Search doctor or practice..."
              autoComplete="off"
            />

            <button
              type="submit"
              className="primary-button"
            >
              Search
            </button>

            {query ? (
              <Link
                href="/admin/doctors"
                className="secondary-button"
              >
                Clear
              </Link>
            ) : null}
          </div>
        </form>

        <div className="doctor-result-count">
          <strong>{filteredDoctors.length}</strong>

          <span>
            {filteredDoctors.length === 1
              ? "doctor found"
              : "doctors found"}
          </span>
        </div>
      </section>

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
              {filteredDoctors.length ? (
                filteredDoctors.map((doctor) => {
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
                    {query
                      ? `No doctors match "${query}".`
                      : "No doctors have been added."}
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