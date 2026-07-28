"use client";

import {
  FileMusic,
  Library,
  LogOut,
  Printer,
  Settings,
  Wrench
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const adminLinks = [
  { href: "/admin/songs", label: "Songs", icon: FileMusic },
  { href: "/admin/print", label: "Print", icon: Printer },
  { href: "/admin/system", label: "System", icon: Wrench }
];

export function AdminHeader() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <header className="admin-navigation">
      <Link href="/admin/songs" className="dashboard-brand">
        <span className="brand-mark" aria-hidden="true">
          <Settings size={24} />
        </span>
        <span>
          Song Cards
          <small>Admin</small>
        </span>
      </Link>
      <nav className="admin-nav" aria-label="Admin navigation">
        {adminLinks.map(({ href, label, icon: Icon }) => (
          <Link
            className={pathname.startsWith(href) ? "is-active" : ""}
            href={href}
            key={href}
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="admin-actions">
        <Link href="/library" title="Back to library">
          <Library size={19} aria-hidden="true" />
          <span>Library</span>
        </Link>
        <button type="button" title="Sign out" onClick={() => void logout()}>
          <LogOut size={19} aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </div>
    </header>
  );
}
