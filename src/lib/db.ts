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
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS markers (
      id INTEGER PRIMARY KEY CHECK (id >= 0 AND id < 250),
      song_id TEXT REFERENCES songs(id) ON DELETE SET NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS markers_song_id_idx ON markers(song_id);
  `);

  const songColumns = next
    .prepare("PRAGMA table_info(songs)")
    .all() as { name: string }[];

  if (!songColumns.some((column) => column.name === "cover_filename")) {
    next.exec("ALTER TABLE songs ADD COLUMN cover_filename TEXT");
  }

  database = next;
  return database;
}
