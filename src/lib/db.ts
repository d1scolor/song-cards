import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "@/lib/config";

const databaseDirectory = path.join(config.dataDirectory, "db");
export const mediaDirectory = path.join(config.dataDirectory, "media");

fs.mkdirSync(databaseDirectory, { recursive: true });
fs.mkdirSync(mediaDirectory, { recursive: true });

const database = new Database(path.join(databaseDirectory, "song-cards.db"));
database.pragma("journal_mode = WAL");
database.pragma("foreign_keys = ON");

database.exec(`
  CREATE TABLE IF NOT EXISTS songs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT NOT NULL DEFAULT '',
    filename TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
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

export default database;
