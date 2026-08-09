import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import type { Song } from "@/lib/types";

const dataDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "song-cards-playback-")
);
process.env.DATA_DIR = dataDirectory;
process.env.PLAYBACK_BACKEND = "mock";

const {
  getPlayerStatus,
  playerAction,
  playSong
} = await import("@/lib/playback");

after(() => {
  fs.rmSync(dataDirectory, { recursive: true, force: true });
});

const song: Song = {
  id: "test-song",
  title: "Test Song",
  artist: "Test Artist",
  filename: "test.mp3",
  originalName: "test.mp3",
  mimeType: "audio/mpeg",
  coverUrl: "/api/covers/test-song",
  durationMs: 180_000,
  integratedLufs: -16,
  shortTermP95Lufs: -13.5,
  loudnessRangeLu: 4,
  analyzedAt: new Date(0).toISOString(),
  analysisError: null,
  manualGainDb: 0,
  startMs: 0,
  endMs: null,
  createdAt: new Date(0).toISOString()
};

test("mock playback supports play, pause, resume, stop, and volume", async () => {
  const playing = await playSong(song);
  assert.equal(playing.state, "play");
  assert.equal(playing.song?.title, song.title);
  assert.equal(playing.song?.coverUrl, song.coverUrl);

  const paused = await playerAction({ action: "pause" });
  assert.equal(paused.state, "pause");

  const resumed = await playerAction({ action: "play" });
  assert.equal(resumed.state, "play");

  const volume = await playerAction({ action: "volume", volume: 42 });
  assert.equal(volume.volume, 42);

  const sought = await playerAction({ action: "seek", positionMs: 15_000 });
  assert.equal(sought.progressMs, 15_000);

  const stopped = await playerAction({ action: "stop" });
  assert.equal(stopped.state, "stop");
  assert.equal((await getPlayerStatus()).progressMs, 0);
});
