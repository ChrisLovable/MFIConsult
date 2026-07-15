import Image from "next/image";
import Link from "next/link";
import {
  requireAdminSession,
} from "@/lib/admin-auth";
import "../admin.css";

export const dynamic = "force-dynamic";

const navigation = [
  {
    href: "/admin",
    label: "Overview",
    symbol: "01",
  },
  {
    href: "/admin/doctors",
    label: "Doctors",
    symbol: "02",
  },
  {
    href: "/admin/ask",
    label: "Ask MFI",
    number: "03",
  },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdminSession();

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link
          href="/admin"
          className="admin-brand"
        >
          <Image
            src="/mfi-logo.png"
            alt="MFI logo"
            width={118}
            height={64}
            className="brand-logo-image"
            priority
          />
          <span className="brand-copy">
            <strong>MFI Consult</strong>
            <small>Billing intelligence</small>
          </span>
        </Link>

        <nav className="admin-nav">
          {navigation.map((item) => (
            <Link
              href={item.href}
              key={item.href}
            >
              <span>{item.symbol}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="admin-identity">
            <span className="identity-dot" />
            <div>
              <strong>MFI Administrator</strong>
              <small>{session.email}</small>
            </div>
          </div>

          <form
            method="post"
            action="/api/admin/logout"
          >
            <button
              type="submit"
              className="ghost-button"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="admin-main">
        {children}
      </div>
    </div>
  );
}
