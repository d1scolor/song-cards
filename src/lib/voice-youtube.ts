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

type YoutubeCandidate = Extract<VoiceCandidate, { source: "youtube" }>;
const videoPattern = /^[\w-]{11}$/;
const maxAudioBytes = 64 * 1024 * 1024;

export function parseYoutubeResults(
  body: unknown,
  settings: Pick<VoiceSettings, "preferredChannels" | "maxSongSeconds">
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
      (settings.preferredChannels.length > 0 &&
        !settings.preferredChannels.includes(entry.channel_id))
    )
      return [];
    return [
      {
        source: "youtube",
        videoId: entry.id,
        channelId: entry.channel_id,
        title: entry.title.slice(0, 120),
        artist: String(entry.channel ?? "").slice(0, 120),
        durationMs: Math.round(entry.duration * 1000)
      }
    ];
  });
}

export async function searchVoiceYoutube(
  query: string,
  settings: VoiceSettings,
  signal: AbortSignal
) {
  const binary = await voiceYouTubeBinary();
  const sources = settings.preferredChannels.length
    ? settings.preferredChannels
        .slice(0, 3)
        .map(
          (id) =>
            `https://www.youtube.com/channel/${id}/search?query=${encodeURIComponent(query)}`
        )
    : [`ytsearch8:${query}`];
  const found: YoutubeCandidate[] = [];
  // Sequential requests keep search bounded and avoid unnecessary YouTube load.
  for (const source of sources) {
    signal.throwIfAborted();
    try {
      const result = await runCommand(
        binary,
        [
          "--ignore-config",
          "--no-cache-dir",
          "--flat-playlist",
          "--playlist-end",
          "8",
          "--dump-single-json",
          "--socket-timeout",
          "10",
          "--retries",
          "1",
          "--",
          source
        ],
        { signal, timeoutMs: 15_000, maxOutputCharacters: 300_000 }
      );
      found.push(...parseYoutubeResults(JSON.parse(result.stdout), settings));
    } catch {
      signal.throwIfAborted();
      if (sources.length === 1)
        throw new Error("YouTube search is unavailable. Please try again.");
    }
    if (found.length >= 8) break;
  }
  return [...new Map(found.map((item) => [item.videoId, item])).values()].slice(
    0,
    8
  );
}

export async function prepareVoiceYoutube(
  candidate: YoutubeCandidate,
  settings: VoiceSettings,
  signal: AbortSignal
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
        "--write-info-json",
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
    const metadata = JSON.parse(
      await fs.readFile(path.join(directory, "audio.info.json"), "utf8")
    );
    if (
      metadata.id !== candidate.videoId ||
      metadata.channel_id !== candidate.channelId ||
      !Number.isFinite(metadata.duration) ||
      metadata.duration <= 0 ||
      metadata.duration > settings.maxSongSeconds ||
      metadata.is_live ||
      (settings.preferredChannels.length > 0 &&
        !settings.preferredChannels.includes(metadata.channel_id))
    ) {
      throw new Error("The selected video no longer matches your settings.");
    }
    const audio = path.join(directory, "audio.m4a");
    if ((await fs.stat(audio)).size > maxAudioBytes)
      throw new Error("The selected song is too large.");
    stored = await storeAudioFile(audio, "audio.m4a", signal);
    signal.throwIfAborted();
    const song = createSong({
      title: candidate.title,
      artist: candidate.artist,
      ...stored,
      originalName: "voice-request.m4a",
      coverFilename: null
    });
    songId = song.id;
    cacheVoiceSong(candidate.videoId, song);
    return song;
  } catch (error) {
    if (songId) deleteSongCard(songId);
    else if (stored)
      await fs
        .unlink(path.join(mediaDirectory, stored.filename))
        .catch(() => undefined);
    signal.throwIfAborted();
    // Raw downloader output can contain temporary signed URLs.
    throw new Error(
      error instanceof Error &&
        error.message === "The selected video no longer matches your settings."
        ? error.message
        : "That song couldn't be prepared. Please try another request."
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
