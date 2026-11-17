export type VoiceMetadata = {
  artist?: string;
  channel?: string;
  uploader?: string;
  viewCount?: number;
  track?: string;
  album?: string;
  description?: string;
};
export function youtubeMetadata(value: unknown): VoiceMetadata {
  if (!value || typeof value !== "object") return {};
  const entry = value as Record<string, unknown>;
  const text = (key: string, limit = 120) =>
    typeof entry[key] === "string"
      ? entry[key].trim().slice(0, limit)
      : undefined;
  const artist =
    text("artist") ||
    (Array.isArray(entry.artists)
      ? entry.artists
          .filter((item) => typeof item === "string")
          .join(", ")
          .slice(0, 120)
      : "");
  return {
    artist,
    ...(text("channel") ? { channel: text("channel") } : {}),
    ...(text("uploader") ? { uploader: text("uploader") } : {}),
    ...(typeof entry.view_count === "number" &&
    Number.isFinite(entry.view_count) &&
    entry.view_count >= 0
      ? { viewCount: Math.floor(entry.view_count) }
      : {}),
    ...(text("track") ? { track: text("track") } : {}),
    ...(text("album") ? { album: text("album") } : {}),
    ...(text("description", 600)
      ? { description: text("description", 600) }
      : {})
  };
}
export function modelVoiceMetadata(value: VoiceMetadata): VoiceMetadata {
  return {
    artist: value.artist ?? "",
    ...(value.channel ? { channel: value.channel } : {}),
    ...(value.uploader ? { uploader: value.uploader } : {}),
    ...(value.viewCount !== undefined ? { viewCount: value.viewCount } : {}),
    ...(value.track ? { track: value.track } : {}),
    ...(value.album ? { album: value.album } : {}),
    ...(value.description
      ? { description: value.description.slice(0, 600) }
      : {})
  };
}
