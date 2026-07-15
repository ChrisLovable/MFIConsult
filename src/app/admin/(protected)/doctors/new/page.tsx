import Link from "next/link";
import { DoctorForm } from "@/components/admin/doctor-form";

export default async function NewDoctorPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
  }>;
}) {
  const params = await searchParams;

  return (
    <>
      <header className="page-header compact-header">
        <div>
          <Link
            href="/admin/doctors"
            className="back-link"
          >
            Back to doctors
          </Link>
          <span className="eyebrow">
            New provider
          </span>
          <h1>Onboard a doctor</h1>
          <p>
            Create the billing profile before
            sending the Telegram invitation.
          </p>
        </div>
      </header>

      {params.error ? (
        <div className="error-banner page-banner">
          The doctor could not be saved. Check
          the required information and try again.
        </div>
      ) : null}

      <DoctorForm
        action="/api/admin/doctors"
        submitLabel="Create doctor profile"
      />
    </>
  );
}
