import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "@/lib/config";

const databaseDirectory = path.join(config.dataDirectory, "db");
export const mediaDirectory = path.join(config.dataDirectory, "media");
export const coverDirectory = path.join(mediaDirectory, "covers");

let database: Database.Database | null = null;

export function ensureStorageDirectories() {
  fs.mkdirSync(databaseDirectory, { recursive: true });
  fs.mkdirSync(mediaDirectory, { recursive: true });
  fs.mkdirSync(coverDirectory, { recursive: true });
}

export function getDatabase() {
  if (database) return database;

  ensureStorageDirectories();
  const next = new Database(path.join(databaseDirectory, "song-cards.db"));
  next.pragma("busy_timeout = 5000");
  next.pragma("journal_mode = WAL");
  next.pragma("foreign_keys = ON");

  next.exec(`
    CREATE TABLE IF NOT EXISTS songs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      artist TEXT NOT NULL DEFAULT '',
      filename TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      cover_filename TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      integrated_lufs REAL,
      short_term_p95_lufs REAL,
      loudness_range_lu REAL,
      analyzed_at TEXT,
      analysis_error TEXT,
      manual_gain_db REAL NOT NULL DEFAULT 0,
      start_ms INTEGER NOT NULL DEFAULT 0,
      end_ms INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS markers (
      id INTEGER PRIMARY KEY CHECK (id >= 0 AND id < 250),
      song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS markers_song_id_idx ON markers(song_id);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS voice_cache (
      video_id TEXT PRIMARY KEY,
      song_id TEXT NOT NULL UNIQUE REFERENCES songs(id) ON DELETE CASCADE,
      last_used_at INTEGER NOT NULL
    );
  `);

  // Releases markers orphaned by versions that retained marker rows after
  // deleting their songs. Existing databases keep their original FK schema.
  next.prepare("DELETE FROM markers WHERE song_id IS NULL").run();

  const songColumns = next
    .prepare("PRAGMA table_info(songs)")
    .all() as { name: string }[];

  if (!songColumns.some((column) => column.name === "cover_filename")) {
    next.exec("ALTER TABLE songs ADD COLUMN cover_filename TEXT");
  }

  const songMigrations = [
    ["duration_ms", "INTEGER NOT NULL DEFAULT 0"],
    ["integrated_lufs", "REAL"],
    ["short_term_p95_lufs", "REAL"],
    ["loudness_range_lu", "REAL"],
    ["analyzed_at", "TEXT"],
    ["analysis_error", "TEXT"],
    ["manual_gain_db", "REAL NOT NULL DEFAULT 0"],
    ["start_ms", "INTEGER NOT NULL DEFAULT 0"],
    ["end_ms", "INTEGER"]
  ] as const;
  for (const [name, definition] of songMigrations) {
    if (!songColumns.some((column) => column.name === name)) {
      next.exec(`ALTER TABLE songs ADD COLUMN ${name} ${definition}`);
    }
  }

  database = next;
  return database;
}
