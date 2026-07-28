"use client";

import { Library, Music2, Radio } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const caregiverLinks = [
  { href: "/library", label: "Library", icon: Library },
  { href: "/remote", label: "Now Playing", icon: Radio }
];

export function CaregiverHeader() {
  const pathname = usePathname();

  return (
    <header className="caregiver-header">
      <Link href="/library" className="dashboard-brand">
        <span className="brand-mark" aria-hidden="true">
          <Music2 size={25} />
        </span>
        <span>Song Cards</span>
      </Link>
      <nav className="caregiver-nav" aria-label="Caregiver navigation">
        {caregiverLinks.map(({ href, label, icon: Icon }) => (
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
      <Link className="caregiver-admin-link" href="/admin">
        Admin
      </Link>
    </header>
  );
}
