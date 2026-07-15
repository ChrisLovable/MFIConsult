import Image from "next/image";
import { redirect } from "next/navigation";
import "../admin.css";
import {
  getAdminSession,
} from "@/lib/admin-auth";

export const metadata = {
  title: "MFI Consult Admin",
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
  }>;
}) {
  const session = await getAdminSession();

  if (session) {
    redirect("/admin");
  }

  const params = await searchParams;

  return (
    <main className="login-shell">
      <div className="login-panel">
        <div className="logo-block login-logo-block">
          <Image
            src="/mfi-logo.png"
            alt="MFI logo"
            width={220}
            height={120}
            className="logo-image"
            priority
          />
          <div className="logo-wording">
            <span className="eyebrow">
              MFI Consult
            </span>
            <p>
              Medical and Financial Solutions
            </p>
          </div>
        </div>
        <h1>Welcome back</h1>
        <p>
          Manage doctors, billing rules,
          onboarding and delivery from one
          secure workspace.
        </p>

        {params.error ? (
          <div className="error-banner">
            Incorrect email or password.
          </div>
        ) : null}

        <form
          method="post"
          action="/api/admin/session"
          className="login-form"
        >
          <label>
            <span>Email address</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="username"
              placeholder="admin@mfi.co.za"
            />
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              placeholder="Your secure password"
            />
          </label>

          <button
            className="primary-button full-button"
            type="submit"
          >
            Sign in to MFI Consult
          </button>
        </form>

        <div className="security-note">
          Patient information is not displayed on
          this login screen.
        </div>
      </div>

      <div className="login-visual">
        <div className="visual-content">
          <span className="eyebrow light">
            From consultation to billing
          </span>
          <h2>
            One voice note.
            <br />
            One verified billing record.
          </h2>
          <div className="flow-list">
            <span>01 Doctor records</span>
            <span>02 AI structures</span>
            <span>03 AI prepares billing</span>
            <span>04 MFI receives</span>
          </div>
        </div>
      </div>
    </main>
  );
}

