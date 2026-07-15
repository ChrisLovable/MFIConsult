import Link from "next/link";
import { notFound } from "next/navigation";
import { DoctorForm } from "@/components/admin/doctor-form";
import { getDoctor } from "@/lib/admin-data";

export default async function DoctorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    saved?: string;
    created?: string;
    error?: string;
  }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const doctor = await getDoctor(id);

  if (!doctor) {
    notFound();
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://mfi-consult.vercel.app";

  const inviteUrl = doctor.invite_code
    ? `${appUrl}/join/${doctor.invite_code}`
    : null;

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
            Doctor profile
          </span>
          <h1>{doctor.full_name}</h1>
          <p>
            Billing profile version{" "}
            {doctor.billing_profile_version ?? 1}
          </p>
        </div>

        <span
          className={
            doctor.telegram_user_id
              ? "connection-pill connected large-pill"
              : "connection-pill large-pill"
          }
        >
          {doctor.telegram_user_id
            ? "Telegram linked"
            : "Awaiting Telegram"}
        </span>
      </header>

      {query.saved || query.created ? (
        <div className="success-banner page-banner">
          Doctor profile saved successfully.
        </div>
      ) : null}

      {query.error ? (
        <div className="error-banner page-banner">
          The changes could not be saved.
        </div>
      ) : null}

      {inviteUrl &&
      !doctor.telegram_user_id ? (
        <section className="invite-card">
          <div>
            <span className="eyebrow">
              Doctor invitation
            </span>
            <h2>Ready to link Telegram</h2>
            <p>
              Send this private link to the
              doctor. It opens a simple onboarding
              page and links the correct Telegram
              account.
            </p>
          </div>

          <div className="invite-link-row">
            <code>{inviteUrl}</code>
            <a
              href={inviteUrl}
              target="_blank"
              rel="noreferrer"
              className="secondary-button"
            >
              Preview invitation
            </a>
          </div>
        </section>
      ) : null}

      <section className="doctor-finance-callout">
        <div>
          <span className="eyebrow">MFI staff only</span>
          <h2>Financial intelligence</h2>
          <p>
            Track recorded work, invoices, payments, outstanding balances,
            overdue accounts and staff follow-up for this doctor.
          </p>
        </div>

        <Link
          href={`/admin/doctors/${doctor.id}/financial`}
          className="primary-button"
        >
          Open financial summary
        </Link>
      </section>

      <DoctorForm
        action={`/api/admin/doctors/${doctor.id}`}
        doctor={doctor}
        submitLabel="Save billing profile"
      />
    </>
  );
}

