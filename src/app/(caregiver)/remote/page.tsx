import type { Metadata } from "next";
import { PlayerControls } from "@/components/player-controls";

export const metadata: Metadata = {
  title: "Now Playing"
};

export default function RemotePage() {
  return (
    <main className="remote-page">
      <section className="control-hero">
        <span className="section-kicker">Now playing</span>
        <h1>The room is yours.</h1>
        <p>See what is playing and adjust it without interrupting the kiosk.</p>
      </section>
      <PlayerControls />
    </main>
  );
}
