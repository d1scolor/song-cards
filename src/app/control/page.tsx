import { Music2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PlayerControls } from "@/components/player-controls";

export const metadata: Metadata = {
  title: "Controls"
};

export default function ControlPage() {
  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <Link href="/play" className="dashboard-brand">
          <span className="brand-mark">
            <Music2 size={25} />
          </span>
          <span>Song Cards</span>
        </Link>
        <nav className="control-nav">
          <Link className="text-link" href="/cards">
            Browse cards
          </Link>
          <Link className="text-link" href="/admin">
            Manage cards
          </Link>
        </nav>
      </header>
      <section className="control-hero">
        <span className="section-kicker">Caregiver controls</span>
        <h1>The room is yours.</h1>
        <p>See what is playing and adjust it without interrupting the scanner.</p>
      </section>
      <PlayerControls />
    </main>
  );
}
