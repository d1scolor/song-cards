import path from "node:path";

function integerFromEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function booleanFromEnv(name: string, fallback: boolean) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return !["0", "false", "no", "off"].includes(value);
}

function numberFromEnv(name: string, fallback: number) {
  const value = Number.parseFloat(process.env[name] ?? "");
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  dataDirectory: process.env.DATA_DIR ?? path.join(process.cwd(), "data"),
  defaultVolume: integerFromEnv("DEFAULT_VOLUME", 35),
  maxVolume: integerFromEnv("MAX_VOLUME", 65),
  loudnessCompensationEnabled: booleanFromEnv(
    "LOUDNESS_COMPENSATION_ENABLED",
    true
  ),
  integratedTargetLufs: numberFromEnv("LOUDNESS_TARGET_LUFS", -16),
  shortTermTargetLufs: numberFromEnv("LOUDNESS_SHORT_TERM_TARGET_LUFS", -13.5),
  volumeCurveDivisor: numberFromEnv("VOLUME_CURVE_DIVISOR", 74),
  maxUploadBytes: integerFromEnv("MAX_UPLOAD_MB", 100) * 1024 * 1024,
  maxCoverBytes: integerFromEnv("MAX_COVER_MB", 10) * 1024 * 1024,
  maxSongDurationSeconds:
    integerFromEnv("MAX_SONG_DURATION_MINUTES", 30) * 60,
  mediaProcessingTimeoutMs:
    integerFromEnv("MEDIA_PROCESSING_TIMEOUT_SECONDS", 300) * 1000,
  youtubeImportTimeoutMs:
    integerFromEnv("YOUTUBE_IMPORT_TIMEOUT_SECONDS", 600) * 1000,
  ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg",
  ffprobePath: process.env.FFPROBE_PATH ?? "ffprobe",
  ytDlpPath: process.env.YTDLP_PATH ?? "",
  ytDlpBundledPath:
    process.env.YTDLP_BUNDLED_PATH ?? "/usr/local/libexec/yt-dlp",
  ytDlpAutoUpdate: booleanFromEnv("YTDLP_AUTO_UPDATE", true),
  ytDlpUpdateChannel: process.env.YTDLP_UPDATE_CHANNEL ?? "stable",
  ytDlpUpdateIntervalHours: integerFromEnv(
    "YTDLP_UPDATE_INTERVAL_HOURS",
    24
  ),
  playbackBackend:
    process.env.PLAYBACK_BACKEND === "owntone" ? "owntone" : "mock",
  ownToneUrl: (process.env.OWNTONE_URL ?? "http://127.0.0.1:3689").replace(
    /\/$/,
    ""
  ),
  ownToneOutputId: process.env.OWNTONE_OUTPUT_ID ?? "",
  ownToneMediaDirectory:
    process.env.OWNTONE_MEDIA_DIRECTORY ?? "/srv/media"
} as const;
