import path from "node:path";

function integerFromEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  dataDirectory: process.env.DATA_DIR ?? path.join(process.cwd(), "data"),
  defaultVolume: integerFromEnv("DEFAULT_VOLUME", 35),
  maxVolume: integerFromEnv("MAX_VOLUME", 65),
  maxUploadBytes: integerFromEnv("MAX_UPLOAD_MB", 100) * 1024 * 1024,
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
