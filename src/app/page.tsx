import { Camera, Settings } from "lucide-react";
import Link from "next/link";
import { isAdminPage } from "@/lib/auth";

export default async function Home() {
  const isAdmin = await isAdminPage();
  return (
    <main className="landing-page">
      <section className="landing-card">
        <span className="section-kicker">Song Cards</span>
        <h1>Where would you like to go?</h1>
        <p>Open the child-friendly scanner or manage the song collection.</p>
        <div className="landing-choices">
          <Link
            className="landing-choice landing-choice--kiosk"
            href="/kiosk"
            replace
          >
            <span>
              <Camera size={34} aria-hidden="true" />
            </span>
            <strong>Kiosk</strong>
            <small>Scan a card and start a song</small>
          </Link>
          <Link
            className="landing-choice landing-choice--admin"
            href={isAdmin ? "/admin/now-playing" : "/admin/login"}
          >
            <span>
              <Settings size={34} aria-hidden="true" />
            </span>
            <strong>Admin</strong>
            <small>
              {isAdmin ? "Manage songs and settings" : "Sign in to manage songs"}
            </small>
          </Link>
        </div>
      </section>
    </main>
  );
}
