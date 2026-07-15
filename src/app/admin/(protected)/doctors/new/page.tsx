import Link from "next/link";
import { DoctorForm } from "@/components/admin/doctor-form";

export const dynamic = "force-dynamic";

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
            Doctor onboarding
          </span>

          <h1>Add a doctor</h1>

          <p>
            Create the doctor profile, define billing
            rules, configure accounting delivery and
            generate a secure Telegram invitation.
          </p>
        </div>

        <div className="onboarding-progress">
          <span className="progress-step active">
            1 Profile
          </span>
          <span className="progress-step">
            2 Billing rules
          </span>
          <span className="progress-step">
            3 Telegram
          </span>
          <span className="progress-step">
            4 Test
          </span>
        </div>
      </header>

      {params.error ? (
        <div className="error-banner page-banner">
          The doctor could not be saved. Review the
          required fields and try again.
        </div>
      ) : null}

      <section className="onboarding-intro-card">
        <div>
          <span className="eyebrow">
            Five-minute setup
          </span>
          <h2>
            Configure once. The doctor then works
            entirely through Telegram.
          </h2>
        </div>

        <div className="onboarding-benefits">
          <span>Automatic billing email</span>
          <span>CSV and Excel attached</span>
          <span>Doctor-specific rules</span>
          <span>Secure Telegram linking</span>
        </div>
      </section>

      <DoctorForm
        action="/api/admin/doctors"
        submitLabel="Create doctor and invitation"
      />
    </>
  );
}
