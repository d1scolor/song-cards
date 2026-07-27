import fs from "node:fs";
import path from "node:path";
import database, { mediaDirectory } from "@/lib/db";
import type { Song, SongCard } from "@/lib/types";

type SongRow = {
  id: string;
  title: string;
  artist: string;
  filename: string;
  original_name: string;
  mime_type: string;
  created_at: string;
};

type SongCardRow = SongRow & {
  marker_id: number;
  active: number;
};

function mapSong(row: SongRow): Song {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    filename: row.filename,
    originalName: row.original_name,
    mimeType: row.mime_type,
    createdAt: row.created_at
  };
}

function mapSongCard(row: SongCardRow): SongCard {
  return {
    ...mapSong(row),
    markerId: row.marker_id,
    active: row.active === 1
  };
}

export function listSongCards(): SongCard[] {
  const rows = database
    .prepare(
      `SELECT songs.*, markers.id AS marker_id, markers.active
       FROM markers
       JOIN songs ON songs.id = markers.song_id
       ORDER BY songs.created_at DESC`
    )
    .all() as SongCardRow[];

  return rows.map(mapSongCard);
}

export function findSongByMarker(markerId: number): Song | null {
  const row = database
    .prepare(
      `SELECT songs.*
       FROM markers
       JOIN songs ON songs.id = markers.song_id
       WHERE markers.id = ? AND markers.active = 1`
    )
    .get(markerId) as SongRow | undefined;

  return row ? mapSong(row) : null;
}

export function nextMarkerId(): number {
  const ids = new Set(
    (
      database.prepare("SELECT id FROM markers ORDER BY id").all() as {
        id: number;
      }[]
    ).map((row) => row.id)
  );

  for (let id = 0; id < 250; id += 1) {
    if (!ids.has(id)) return id;
  }
  throw new Error("All 250 marker identifiers have been allocated.");
}

export function createSongCard(input: {
  title: string;
  artist: string;
  markerId: number;
  filename: string;
  originalName: string;
  mimeType: string;
}): SongCard {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  database.transaction(() => {
    database
      .prepare(
        `INSERT INTO songs
          (id, title, artist, filename, original_name, mime_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.title,
        input.artist,
        input.filename,
        input.originalName,
        input.mimeType,
        createdAt
      );
    database
      .prepare(
        `INSERT INTO markers (id, song_id, active, created_at)
         VALUES (?, ?, 1, ?)`
      )
      .run(input.markerId, id, createdAt);
  })();

  return {
    id,
    title: input.title,
    artist: input.artist,
    markerId: input.markerId,
    active: true,
    filename: input.filename,
    originalName: input.originalName,
    mimeType: input.mimeType,
    createdAt
  };
}

export function deleteSongCard(songId: string): boolean {
  const row = database
    .prepare("SELECT filename FROM songs WHERE id = ?")
    .get(songId) as { filename: string } | undefined;
  if (!row) return false;

  database.transaction(() => {
    database
      .prepare("UPDATE markers SET active = 0 WHERE song_id = ?")
      .run(songId);
    database.prepare("DELETE FROM songs WHERE id = ?").run(songId);
  })();
  try {
    fs.unlinkSync(path.join(mediaDirectory, row.filename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return true;
}
