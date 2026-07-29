import type { Metadata } from "next";
import { PlayerControls } from "@/components/player-controls";
import { isAdminPage } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Now Playing"
};

export default async function RemotePage() {
  const isAdmin = await isAdminPage();
  return (
    <main className="remote-page">
      <section className="control-hero">
        <span className="section-kicker">Now playing</span>
        <h1>The room is yours.</h1>
        <p>See what is playing and adjust it without interrupting the kiosk.</p>
      </section>
      <PlayerControls allowTrimEditing={isAdmin} />
    </main>
  );
}
