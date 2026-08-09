import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import type { Song } from "@/lib/types";

const dataDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "song-cards-disabled-playback-")
);
process.env.DATA_DIR = dataDirectory;
delete process.env.PLAYBACK_BACKEND;
delete process.env.KIOSK_PLAYBACK_TARGET;

const { getPlayerStatus, playSong } = await import("@/lib/playback");
const { getPlaybackSettings } = await import("@/lib/repository");

after(() => {
  fs.rmSync(dataDirectory, { recursive: true, force: true });
});

const song: Song = {
  id: "disabled-test",
  title: "Local-first song",
  artist: "",
  filename: "local.m4a",
  originalName: "local.m4a",
  mimeType: "audio/mp4",
  coverUrl: null,
  durationMs: 60_000,
  integratedLufs: null,
  shortTermP95Lufs: null,
  loudnessRangeLu: null,
  analyzedAt: null,
  analysisError: null,
  manualGainDb: 0,
  startMs: 0,
  endMs: null,
  createdAt: new Date(0).toISOString()
};

test("new installations default to local playback with no external backend", async () => {
  assert.equal(getPlaybackSettings().kioskPlaybackTarget, "local");
  assert.equal((await getPlayerStatus()).backend, "disabled");
  await assert.rejects(
    playSong(song),
    /External speaker playback is disabled/
  );
});
