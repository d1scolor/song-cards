import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import Database from "better-sqlite3";

const dataDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "song-cards-repository-")
);
process.env.DATA_DIR = dataDirectory;

const databaseDirectory = path.join(dataDirectory, "db");
fs.mkdirSync(databaseDirectory, { recursive: true });
const legacyDatabase = new Database(
  path.join(databaseDirectory, "song-cards.db")
);
legacyDatabase.exec(`
  CREATE TABLE songs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT NOT NULL DEFAULT '',
    filename TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE markers (
    id INTEGER PRIMARY KEY CHECK (id >= 0 AND id < 250),
    song_id TEXT REFERENCES songs(id) ON DELETE SET NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  INSERT INTO markers (id, song_id, active, created_at)
  VALUES (0, NULL, 0, '2026-01-01T00:00:00.000Z');
`);
legacyDatabase.close();

const {
  createSongCard,
  deleteSongCard,
  findSongCardById,
  getPlaybackSettings,
  nextMarkerId,
  updatePlaybackSettings,
  updateSongPlayback
} = await import("@/lib/repository");

after(() => {
  fs.rmSync(dataDirectory, { recursive: true, force: true });
});

test("deleting a song releases its marker for reuse", () => {
  // Startup should first release the orphan seeded using the old schema.
  assert.equal(nextMarkerId(), 0);

  const first = createSongCard({
    title: "First song",
    artist: "",
    markerId: 0,
    filename: "first.mp3",
    originalName: "first.mp3",
    mimeType: "audio/mpeg",
    coverFilename: null
  });

  assert.deepEqual(findSongCardById(first.id), first);
  assert.equal(nextMarkerId(), 1);
  assert.equal(deleteSongCard(first.id), true);
  assert.equal(findSongCardById(first.id), null);
  assert.equal(nextMarkerId(), 0);

  const replacement = createSongCard({
    title: "Replacement song",
    artist: "",
    markerId: 0,
    filename: "replacement.mp3",
    originalName: "replacement.mp3",
    mimeType: "audio/mpeg",
    coverFilename: null
  });

  assert.equal(replacement.markerId, 0);
  assert.equal(nextMarkerId(), 1);
});

test("persists global loudness settings and song playback metadata", () => {
  const card = createSongCard({
    title: "Tunable song",
    artist: "",
    markerId: 2,
    filename: "tunable.mp3",
    originalName: "tunable.mp3",
    mimeType: "audio/mpeg",
    coverFilename: null,
    durationMs: 90_000,
    analysis: {
      integratedLufs: -20,
      shortTermP95Lufs: -16,
      loudnessRangeLu: 6
    }
  });

  const updated = updateSongPlayback(card.id, {
    manualGainDb: -1.5,
    startMs: 2_500,
    endMs: 80_000
  });
  assert.equal(updated?.manualGainDb, -1.5);
  assert.equal(updated?.startMs, 2_500);
  assert.equal(updated?.endMs, 80_000);
  assert.equal(updated?.integratedLufs, -20);

  updatePlaybackSettings({
    loudnessCompensationEnabled: false,
    integratedTargetLufs: -17,
    shortTermTargetLufs: -14,
    curveDivisor: 80
  });
  assert.deepEqual(getPlaybackSettings(), {
    masterVolume: 35,
    loudnessCompensationEnabled: false,
    integratedTargetLufs: -17,
    shortTermTargetLufs: -14,
    curveDivisor: 80
  });
});
