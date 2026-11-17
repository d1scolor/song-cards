import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { config } from "@/lib/config";
import { mediaDirectory } from "@/lib/db";
import { runCommand } from "@/lib/command";
import { storeAudioFile } from "@/lib/media";
import {
  cacheVoiceSong,
  createSong,
  deleteSongCard,
  findVoiceCachedSong
} from "@/lib/repository";
import { voiceYouTubeBinary } from "@/lib/ytdlp";
import type { VoiceSettings } from "@/lib/voice-settings";
import type { VoiceCandidate } from "@/lib/voice-agent";
import { VoiceOperationError } from "@/lib/voice-errors";
import { voiceFailure } from "@/lib/voice-diagnostics";
import {
  youtubeMetadata,
  modelVoiceMetadata,
  type VoiceMetadata
} from "@/lib/voice-metadata";

type YoutubeCandidate = Extract<VoiceCandidate, { source: "youtube" }>;
const videoPattern = /^[\w-]{11}$/;
const maxAudioBytes = 64 * 1024 * 1024;

export function parseYoutubeResults(
  body: unknown,
  settings: Pick<VoiceSettings, "preferredChannels" | "maxSongSeconds">,
  scope: "preferred" | "all" = "preferred"
): YoutubeCandidate[] {
  const entries = (body as { entries?: unknown[] })?.entries;
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((value): YoutubeCandidate[] => {
    if (!value || typeof value !== "object") return [];
    const entry = value as Record<string, unknown>;
    if (
      typeof entry.id !== "string" ||
      !videoPattern.test(entry.id) ||
      typeof entry.title !== "string" ||
      typeof entry.channel_id !== "string" ||
      typeof entry.duration !== "number" ||
      !Number.isFinite(entry.duration) ||
      entry.duration <= 0 ||
      entry.duration > settings.maxSongSeconds ||
      entry.is_live === true ||
      (scope === "preferred" &&
        settings.preferredChannels.length > 0 &&
        !settings.preferredChannels.includes(entry.channel_id))
    )
      return [];
    return [
      {
        source: "youtube",
        videoId: entry.id,
        channelId: entry.channel_id,
        title: entry.title.slice(0, 120),
        ...youtubeMetadata(entry),
        artist: youtubeMetadata(entry).artist ?? "",
        durationMs: Math.round(entry.duration * 1000)
      }
    ];
  });
}

export function preferredChannelBatch(
  channels: string[],
  query: string
): string[] {
  if (!channels.length) return [];
  // All configured channels participate in global-result ranking. Rotate a
  // small targeted batch by topic instead of permanently ignoring entries
  // after the first three or issuing 50 requests for every spoken request.
  const offset =
    [...query].reduce(
      (hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0,
      0
    ) % channels.length;
  return Array.from(
    { length: Math.min(3, channels.length) },
    (_, index) => channels[(offset + index) % channels.length]
  );
}

export async function searchVoiceYoutube(
  query: string,
  settings: VoiceSettings,
  signal: AbortSignal,
  scope: "preferred" | "all" = "preferred"
) {
  const binary = await voiceYouTubeBinary();
  const request = async (source: string) => {
    const result = await runCommand(
      binary,
      [
        "--ignore-config",
        "--no-cache-dir",
        "--flat-playlist",
        "--playlist-end",
        "24",
        "--dump-single-json",
        "--socket-timeout",
        "10",
        "--retries",
        "1",
        "--",
        source
      ],
      { signal, timeoutMs: 15000, maxOutputCharacters: 600000 }
    );
    return parseYoutubeResults(JSON.parse(result.stdout), settings, scope);
  };
  signal.throwIfAborted();
  let found: YoutubeCandidate[] = [];
  let successful = false;
  let lastError: unknown;
  try {
    found = await request(`ytsearch24:${query}`);
    successful = true;
  } catch (error) {
    lastError = error;
    signal.throwIfAborted();
  }
  if (
    scope === "preferred" &&
    settings.preferredChannels.length &&
    found.length < 4
  ) {
    const targeted = await Promise.allSettled(
      preferredChannelBatch(settings.preferredChannels, query).map((id) =>
        request(
          `https://www.youtube.com/channel/${id}/search?query=${encodeURIComponent(query)}`
        )
      )
    );
    for (const result of targeted)
      if (result.status === "fulfilled") {
        successful = true;
        found.push(...result.value);
      } else lastError = result.reason;
  }
  signal.throwIfAborted();
  if (!successful) throw voiceFailure(lastError, "youtube_search_failed");
  return [...new Map(found.map((item) => [item.videoId, item])).values()].slice(
    0,
    8
  );
}

export async function prepareVoiceYoutube(
  candidate: YoutubeCandidate,
  settings: VoiceSettings,
  signal: AbortSignal,
  onProgress?: (phase: "download" | "audio_processing") => void
) {
  const cached = findVoiceCachedSong(candidate.videoId);
  if (cached) return cached;
  if (!videoPattern.test(candidate.videoId))
    throw new Error("Invalid video selection.");
  const binary = await voiceYouTubeBinary();
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "song-cards-voice-")
  );
  let stored: Awaited<ReturnType<typeof storeAudioFile>> | undefined;
  let songId: string | undefined;
  try {
    onProgress?.("download");
    await runCommand(
      binary,
      [
        "--ignore-config",
        "--no-cache-dir",
        "--no-playlist",
        "--abort-on-error",
        "--no-progress",
        "--socket-timeout",
        "15",
        "--retries",
        "1",
        "--fragment-retries",
        "1",
        "--max-filesize",
        String(Math.min(maxAudioBytes, config.maxUploadBytes)),
        "--match-filters",
        `duration <= ${settings.maxSongSeconds} & !is_live`,
        "--js-runtimes",
        "node",
        "--format",
        "bestaudio[ext=m4a]/bestaudio/best",
        ...(path.isAbsolute(config.ffmpegPath)
          ? ["--ffmpeg-location", config.ffmpegPath]
          : []),
        "--extract-audio",
        "--audio-format",
        "m4a",
        "--audio-quality",
        "192K",
        "--output",
        path.join(directory, "audio.%(ext)s"),
        "--",
        `https://www.youtube.com/watch?v=${candidate.videoId}`
      ],
      {
        signal,
        timeoutMs: Math.min(config.youtubeImportTimeoutMs, 90_000),
        maxOutputCharacters: 10_000
      }
    );
    signal.throwIfAborted();
    // Search metadata guides selection; it is not a reason to discard usable
    // downloaded audio. Download filters bound resources, and storeAudioFile
    // probes the actual audio rather than trusting a JSON sidecar.
    const audio = path.join(directory, "audio.m4a");
    onProgress?.("audio_processing");
    try {
      stored = await storeAudioFile(audio, "audio.m4a", signal);
    } catch {
      signal.throwIfAborted();
      throw new VoiceOperationError("audio_processing_failed");
    }
    signal.throwIfAborted();
    const song = createSong({
      title: candidate.title,
      artist: candidate.artist || candidate.channel || candidate.uploader || "",
      ...stored,
      originalName: "voice-request.m4a",
      coverFilename: null
    });
    songId = song.id;
    cacheVoiceSong(candidate.videoId, song, modelVoiceMetadata(candidate));
    return song;
  } catch (error) {
    if (songId) deleteSongCard(songId);
    else if (stored)
      await fs
        .unlink(path.join(mediaDirectory, stored.filename))
        .catch(() => undefined);
    signal.throwIfAborted();
    // Raw downloader output can contain temporary signed URLs.
    throw voiceFailure(error, "download_failed");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

declare global {
  var __songCardsVoiceMetadata:
    Map<string, { at: number; metadata: VoiceMetadata }> | undefined;
}
const metadataCache = (globalThis.__songCardsVoiceMetadata ??= new Map());
export async function inspectVoiceYoutube(
  videoId: string,
  signal: AbortSignal
): Promise<VoiceMetadata> {
  if (!videoPattern.test(videoId)) throw new Error("Invalid video selection.");
  signal.throwIfAborted();
  const cached = metadataCache.get(videoId);
  if (cached && Date.now() - cached.at < 15 * 60_000)
    return { ...cached.metadata };
  const binary = await voiceYouTubeBinary();
  const result = await runCommand(
    binary,
    [
      "--ignore-config",
      "--no-cache-dir",
      "--no-playlist",
      "--skip-download",
      "--dump-single-json",
      "--socket-timeout",
      "10",
      "--retries",
      "1",
      "--js-runtimes",
      "node",
      "--",
      `https://www.youtube.com/watch?v=${videoId}`
    ],
    { signal, timeoutMs: 15000, maxOutputCharacters: 1500000 }
  );
  signal.throwIfAborted();
  const body = JSON.parse(result.stdout);
  if (body?.id !== videoId) throw new VoiceOperationError("invalid_response");
  const metadata = youtubeMetadata(body);
  metadataCache.delete(videoId);
  metadataCache.set(videoId, { at: Date.now(), metadata });
  while (metadataCache.size > 100)
    metadataCache.delete(metadataCache.keys().next().value!);
  return { ...metadata };
}
