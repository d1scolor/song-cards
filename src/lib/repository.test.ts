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
  nextMarkerId
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

  assert.equal(nextMarkerId(), 1);
  assert.equal(deleteSongCard(first.id), true);
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
