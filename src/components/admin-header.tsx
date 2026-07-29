"use client";

import {
  AudioLines,
  FileMusic,
  LogOut,
  Printer,
  Radio,
  ScanLine,
  Settings,
  Wrench
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const adminLinks = [
  { href: "/admin/now-playing", label: "Now Playing", icon: Radio },
  { href: "/admin/library", label: "Library", icon: AudioLines },
  { href: "/admin/add", label: "Add Songs", icon: FileMusic },
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
      <Link href="/admin/now-playing" className="dashboard-brand">
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
        <Link href="/kiosk" title="Open kiosk">
          <ScanLine size={19} aria-hidden="true" />
          <span>Kiosk</span>
        </Link>
        <button type="button" title="Sign out" onClick={() => void logout()}>
          <LogOut size={19} aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </div>
    </header>
  );
}
