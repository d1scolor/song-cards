import type { Metadata } from "next";
import { PlaybackConsole } from "@/components/playback-console";

export const metadata: Metadata = {
  title: "Now Playing"
};

export default function AdminNowPlayingPage() {
  return (
    <main className="admin-shell remote-page admin-now-playing">
      <section className="control-hero">
        <span className="section-kicker">Now playing</span>
        <h1>Choose where to listen.</h1>
        <p>Control the shared OwnTone speaker or audio playing on this device.</p>
      </section>
      <PlaybackConsole />
    </main>
  );
}
