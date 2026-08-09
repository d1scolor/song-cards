import type { Metadata } from "next";
import { PlaybackConsole } from "@/components/playback-console";
import { config } from "@/lib/config";

export const metadata: Metadata = {
  title: "Now Playing"
};

export default function AdminNowPlayingPage() {
  const speakerPlaybackEnabled = config.playbackBackend !== "disabled";
  return (
    <main className="admin-shell remote-page admin-now-playing">
      <section className="control-hero">
        <span className="section-kicker">Now playing</span>
        <h1>Choose where to listen.</h1>
        <p>
          {speakerPlaybackEnabled
            ? "Control the shared OwnTone speaker or audio playing on this device."
            : "Listen through this device. OwnTone can be added later for shared-speaker playback."}
        </p>
      </section>
      <PlaybackConsole speakerPlaybackEnabled={speakerPlaybackEnabled} />
    </main>
  );
}
