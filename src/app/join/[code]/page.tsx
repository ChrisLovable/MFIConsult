import Image from "next/image";
import { notFound } from "next/navigation";
import "../../admin/admin.css";

export const dynamic = "force-dynamic";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export default async function DoctorJoinPage({
  params,
}: {
  params: Promise<{
    code: string;
  }>;
}) {
  const { code } = await params;
  const supabase = getSupabaseAdmin();

  const { data: doctor, error } = await supabase
    .from("consultbill_doctors")
    .select(`
      full_name,
      practice_name,
      speciality,
      billing_profile,
      is_active,
      telegram_user_id
    `)
    .eq("invite_code", code.toUpperCase())
    .maybeSingle();

  if (error || !doctor || !doctor.is_active) {
    notFound();
  }

  const profile =
    (doctor.billing_profile ??
      {}) as Record<string, unknown>;

  const telegramUrl =
    `https://t.me/MFIConsult_bot?start=${encodeURIComponent(
      code.toUpperCase(),
    )}`;

  return (
    <main className="join-shell">
      <section className="join-card">
        <div className="logo-block join-logo-block">
          <Image
            src="/mfi-logo.png"
            alt="MFI logo"
            width={200}
            height={110}
            className="join-logo-image"
            priority
          />
          <div className="logo-wording">
            <span className="eyebrow">
              Doctor onboarding
            </span>
            <p>
              Medical and Financial Solutions
            </p>
          </div>
        </div>
        <h1>
          Welcome, {doctor.full_name}
        </h1>
        <p className="join-intro">
          Your MFI Consult profile is ready.
          Link Telegram to start submitting
          consultation billing voice notes.
        </p>

        <div className="profile-summary">
          <div>
            <span>Practice</span>
            <strong>
              {doctor.practice_name || "MFI"}
            </strong>
          </div>
          <div>
            <span>Speciality</span>
            <strong>
              {doctor.speciality || "Medical practitioner"}
            </strong>
          </div>
          <div>
            <span>Billing basis</span>
            <strong>
              {String(
                profile.billing_basis ??
                  "per_consultation",
              ).replaceAll("_", " ")}
            </strong>
          </div>
          <div>
            <span>Confirmation</span>
            <strong>Required before sending</strong>
          </div>
        </div>

        {doctor.telegram_user_id ? (
          <div className="success-banner">
            Telegram is already linked for this
            doctor.
          </div>
        ) : (
          <>
            <a
              href={telegramUrl}
              className="primary-button full-button join-button"
            >
              Open MFI Consult in Telegram
            </a>
            <p className="join-help">
              Telegram will open the MFI Consult
              bot and securely connect this doctor
              profile.
            </p>
          </>
        )}

        <div className="join-steps">
          <span>1. Link Telegram</span>
          <span>2. Send a test voice note</span>
          <span>3. Review and confirm</span>
        </div>
      </section>
    </main>
  );
}

