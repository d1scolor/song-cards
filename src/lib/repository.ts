import fs from "node:fs";
import path from "node:path";
import {
  coverDirectory,
  getDatabase,
  mediaDirectory
} from "@/lib/db";
import { config } from "@/lib/config";
import type {
  LoudnessAnalysis,
  PlaybackSettings,
  Song,
  SongCard
} from "@/lib/types";

type SongRow = {
  id: string;
  title: string;
  artist: string;
  filename: string;
  original_name: string;
  mime_type: string;
  cover_filename: string | null;
  duration_ms: number;
  integrated_lufs: number | null;
  short_term_p95_lufs: number | null;
  loudness_range_lu: number | null;
  analyzed_at: string | null;
  analysis_error: string | null;
  manual_gain_db: number;
  start_ms: number;
  end_ms: number | null;
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
    coverUrl: row.cover_filename
      ? `/api/covers/${encodeURIComponent(row.id)}`
      : null,
    durationMs: row.duration_ms,
    integratedLufs: row.integrated_lufs,
    shortTermP95Lufs: row.short_term_p95_lufs,
    loudnessRangeLu: row.loudness_range_lu,
    analyzedAt: row.analyzed_at,
    analysisError: row.analysis_error,
    manualGainDb: row.manual_gain_db,
    startMs: row.start_ms,
    endMs: row.end_ms,
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
  const database = getDatabase();
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

export function findSongCardById(songId: string): SongCard | null {
  const database = getDatabase();
  const row = database
    .prepare(
      `SELECT songs.*, markers.id AS marker_id, markers.active
       FROM markers
       JOIN songs ON songs.id = markers.song_id
       WHERE songs.id = ? AND markers.active = 1`
    )
    .get(songId) as SongCardRow | undefined;

  return row ? mapSongCard(row) : null;
}

export function findSongByMarker(markerId: number): Song | null {
  const database = getDatabase();
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

export function findSongByFilename(filename: string): Song | null {
  const database = getDatabase();
  const row = database
    .prepare("SELECT * FROM songs WHERE filename = ?")
    .get(filename) as SongRow | undefined;

  return row ? mapSong(row) : null;
}

export function findSongById(songId: string): Song | null {
  const database = getDatabase();
  const row = database
    .prepare("SELECT * FROM songs WHERE id = ?")
    .get(songId) as SongRow | undefined;
  return row ? mapSong(row) : null;
}

export function findSongCover(songId: string): string | null {
  const database = getDatabase();
  const row = database
    .prepare("SELECT cover_filename FROM songs WHERE id = ?")
    .get(songId) as { cover_filename: string | null } | undefined;

  return row?.cover_filename
    ? path.join(coverDirectory, row.cover_filename)
    : null;
}

export function nextMarkerId(): number {
  const database = getDatabase();
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
  coverFilename: string | null;
  durationMs?: number;
  analysis?: LoudnessAnalysis | null;
  analysisError?: string | null;
}): SongCard {
  const database = getDatabase();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  database.transaction(() => {
    database
      .prepare(
        `INSERT INTO songs (
           id, title, artist, filename, original_name, mime_type, cover_filename,
           duration_ms, integrated_lufs, short_term_p95_lufs,
           loudness_range_lu, analyzed_at, analysis_error, created_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.title,
        input.artist,
        input.filename,
        input.originalName,
        input.mimeType,
        input.coverFilename,
        Math.max(0, Math.round((input.durationMs ?? 0))),
        input.analysis?.integratedLufs ?? null,
        input.analysis?.shortTermP95Lufs ?? null,
        input.analysis?.loudnessRangeLu ?? null,
        input.analysis ? createdAt : null,
        input.analysisError ?? null,
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
    coverUrl: input.coverFilename
      ? `/api/covers/${encodeURIComponent(id)}`
      : null,
    durationMs: Math.max(0, Math.round(input.durationMs ?? 0)),
    integratedLufs: input.analysis?.integratedLufs ?? null,
    shortTermP95Lufs: input.analysis?.shortTermP95Lufs ?? null,
    loudnessRangeLu: input.analysis?.loudnessRangeLu ?? null,
    analyzedAt: input.analysis ? createdAt : null,
    analysisError: input.analysisError ?? null,
    manualGainDb: 0,
    startMs: 0,
    endMs: null,
    createdAt
  };
}

export function updateSongPlayback(
  songId: string,
  input: {
    manualGainDb?: number;
    startMs?: number;
    endMs?: number | null;
  }
): Song | null {
  const database = getDatabase();
  const current = findSongById(songId);
  if (!current) return null;

  const manualGainDb = input.manualGainDb ?? current.manualGainDb;
  const startMs = input.startMs ?? current.startMs;
  const endMs = input.endMs === undefined ? current.endMs : input.endMs;
  database
    .prepare(
      `UPDATE songs
       SET manual_gain_db = ?, start_ms = ?, end_ms = ?
       WHERE id = ?`
    )
    .run(manualGainDb, startMs, endMs, songId);
  return findSongById(songId);
}

export function saveSongAnalysis(
  songId: string,
  input:
    | { analysis: LoudnessAnalysis; durationMs?: number }
    | { error: string; durationMs?: number }
): Song | null {
  const database = getDatabase();
  if ("analysis" in input) {
    database
      .prepare(
        `UPDATE songs
         SET integrated_lufs = ?, short_term_p95_lufs = ?,
             loudness_range_lu = ?, analyzed_at = ?, analysis_error = NULL,
             duration_ms = CASE WHEN ? > 0 THEN ? ELSE duration_ms END
         WHERE id = ?`
      )
      .run(
        input.analysis.integratedLufs,
        input.analysis.shortTermP95Lufs,
        input.analysis.loudnessRangeLu,
        new Date().toISOString(),
        input.durationMs ?? 0,
        input.durationMs ?? 0,
        songId
      );
  } else {
    database
      .prepare(
        `UPDATE songs
         SET analysis_error = ?, analyzed_at = ?,
             duration_ms = CASE WHEN ? > 0 THEN ? ELSE duration_ms END
         WHERE id = ?`
      )
      .run(
        input.error.slice(0, 500),
        new Date().toISOString(),
        input.durationMs ?? 0,
        input.durationMs ?? 0,
        songId
      );
  }
  return findSongById(songId);
}

const settingDefaults: PlaybackSettings = {
  masterVolume: Math.min(config.defaultVolume, config.maxVolume),
  kioskPlaybackTarget: config.kioskPlaybackTarget,
  loudnessCompensationEnabled: config.loudnessCompensationEnabled,
  integratedTargetLufs: config.integratedTargetLufs,
  shortTermTargetLufs: config.shortTermTargetLufs,
  curveDivisor: config.volumeCurveDivisor
};

const settingKeys = {
  masterVolume: "playback.master_volume",
  kioskPlaybackTarget: "playback.kiosk_target",
  loudnessCompensationEnabled: "loudness.enabled",
  integratedTargetLufs: "loudness.integrated_target_lufs",
  shortTermTargetLufs: "loudness.short_term_target_lufs",
  curveDivisor: "loudness.curve_divisor"
} as const;

export function getPlaybackSettings(): PlaybackSettings {
  const database = getDatabase();
  const rows = database
    .prepare("SELECT key, value FROM settings")
    .all() as { key: string; value: string }[];
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const numberSetting = (
    key: keyof PlaybackSettings,
    fallback: number
  ) => {
    const value = Number.parseFloat(values.get(settingKeys[key]) ?? "");
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    masterVolume: Math.max(
      0,
      Math.min(
        config.maxVolume,
        numberSetting("masterVolume", settingDefaults.masterVolume)
      )
    ),
    kioskPlaybackTarget:
      values.get(settingKeys.kioskPlaybackTarget) === "local"
        ? "local"
        : settingDefaults.kioskPlaybackTarget,
    loudnessCompensationEnabled:
      values.get(settingKeys.loudnessCompensationEnabled) === undefined
        ? settingDefaults.loudnessCompensationEnabled
        : values.get(settingKeys.loudnessCompensationEnabled) === "true",
    integratedTargetLufs: numberSetting(
      "integratedTargetLufs",
      settingDefaults.integratedTargetLufs
    ),
    shortTermTargetLufs: numberSetting(
      "shortTermTargetLufs",
      settingDefaults.shortTermTargetLufs
    ),
    curveDivisor: numberSetting(
      "curveDivisor",
      settingDefaults.curveDivisor
    )
  };
}

export function updatePlaybackSettings(
  patch: Partial<PlaybackSettings>
): PlaybackSettings {
  const database = getDatabase();
  const write = database.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  database.transaction(() => {
    for (const [key, value] of Object.entries(patch) as [
      keyof PlaybackSettings,
      PlaybackSettings[keyof PlaybackSettings]
    ][]) {
      write.run(settingKeys[key], String(value));
    }
  })();
  return getPlaybackSettings();
}

export function deleteSongCard(songId: string): boolean {
  const database = getDatabase();
  const row = database
    .prepare("SELECT filename, cover_filename FROM songs WHERE id = ?")
    .get(songId) as
    | { filename: string; cover_filename: string | null }
    | undefined;
  if (!row) return false;

  database.transaction(() => {
    database
      .prepare("DELETE FROM markers WHERE song_id = ?")
      .run(songId);
    database.prepare("DELETE FROM songs WHERE id = ?").run(songId);
  })();
  try {
    fs.unlinkSync(path.join(mediaDirectory, row.filename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (row.cover_filename) {
    try {
      fs.unlinkSync(path.join(coverDirectory, row.cover_filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return true;
}
