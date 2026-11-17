import path from "node:path";
import { VoiceOperationError, type SpeakerOperation } from "@/lib/voice-errors";
import { abortableDelay } from "@/lib/async-deadline";
import { config } from "@/lib/config";
import { effectiveVolume, songCompensation } from "@/lib/loudness";
import {
  findSongByFilename,
  getPlaybackSettings,
  updatePlaybackSettings
} from "@/lib/repository";
import type { PlayerStatus, Song } from "@/lib/types";

type MockRuntime = {
  state: "play" | "pause" | "stop";
  volume: number;
  progressMs: number;
  startedAt: number | null;
  durationMs: number;
  song: Song | null;
};

declare global {
  var __songCardsMockPlayer: MockRuntime | undefined;
  var __songCardsEndMonitor: NodeJS.Timeout | undefined;
  var __songCardsEndMonitorBusy: boolean | undefined;
}

const mock =
  globalThis.__songCardsMockPlayer ??
  ({
    state: "stop",
    volume: Math.min(config.defaultVolume, config.maxVolume),
    progressMs: 0,
    startedAt: null,
    durationMs: 180_000,
    song: null
  } satisfies MockRuntime);

globalThis.__songCardsMockPlayer = mock;

function stopEndMonitor() {
  if (globalThis.__songCardsEndMonitor) {
    clearInterval(globalThis.__songCardsEndMonitor);
    globalThis.__songCardsEndMonitor = undefined;
  }
}

function startEndMonitor() {
  stopEndMonitor();
  const timer = setInterval(async () => {
    if (globalThis.__songCardsEndMonitorBusy) return;
    globalThis.__songCardsEndMonitorBusy = true;
    try {
      const status =
        config.playbackBackend === "owntone"
          ? await ownToneStatus()
          : mockStatus();
      if (status.state !== "play") stopEndMonitor();
    } catch {
      // A transient OwnTone failure should not terminate the app. The next
      // normal player request can restart monitoring when playback resumes.
      stopEndMonitor();
    } finally {
      globalThis.__songCardsEndMonitorBusy = false;
    }
  }, 750);
  timer.unref();
  globalThis.__songCardsEndMonitor = timer;
}

function mockProgress() {
  if (mock.state !== "play" || mock.startedAt === null) return mock.progressMs;
  return Math.min(
    mock.durationMs,
    mock.progressMs + Date.now() - mock.startedAt
  );
}

function mockStatus(): PlayerStatus {
  const progressMs = mockProgress();
  const endMs = mock.song?.endMs ?? mock.durationMs;
  if (progressMs >= endMs && mock.state === "play") {
    mock.state = "stop";
    mock.progressMs = 0;
    mock.startedAt = null;
  }
  const settings = getPlaybackSettings();
  const compensation = mock.song
    ? songCompensation(mock.song, settings)
    : null;
  return {
    backend: "mock",
    connected: true,
    state: mock.state,
    volume: settings.masterVolume,
    maxVolume: config.maxVolume,
    effectiveVolume: mock.volume,
    progressMs: mock.state === "stop" ? 0 : progressMs,
    durationMs: mock.durationMs,
    song: mock.song
      ? {
          id: mock.song.id,
          title: mock.song.title,
          artist: mock.song.artist,
          coverUrl: mock.song.coverUrl
        }
      : null,
    trim: mock.song
      ? { startMs: mock.song.startMs, endMs: mock.song.endMs }
      : null,
    compensation,
    message: "Mock playback"
  };
}

function disabledStatus(): PlayerStatus {
  const settings = getPlaybackSettings();
  return {
    backend: "disabled",
    connected: false,
    state: "stop",
    volume: settings.masterVolume,
    maxVolume: config.maxVolume,
    effectiveVolume: 0,
    progressMs: 0,
    durationMs: 0,
    song: null,
    trim: null,
    compensation: null,
    message: "External speaker playback is not configured."
  };
}

async function ownToneRequest(
  pathname: string,
  init?: RequestInit,
  allowEmpty = false
) {
  const operations: Record<string, SpeakerOperation> = {
    "/api/outputs/set": "output_selection",
    "/api/player/volume": "volume",
    "/api/library/files": "library_lookup",
    "/api/library": "library_status",
    "/api/queue/items/add": "queue_add",
    "/api/player/play": "play",
    "/api/player/pause": "pause",
    "/api/player/stop": "stop",
    "/api/player/seek": "seek",
    "/api/player": "status",
    "/api/queue": "queue_status",
    "/api/update": "scan"
  };
  const response = await fetch(`${config.ownToneUrl}${pathname}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(5_000)
  });
  if (!response.ok) {
    throw new VoiceOperationError(
      "speaker_http_error",
      response.status,
      `OwnTone returned ${response.status} for ${pathname.split("?")[0]}.`,
      operations[pathname.split("?")[0]] ?? "other"
    );
  }
  if (allowEmpty || response.status === 204) return null;
  return response.json();
}

async function ownToneStatus(strict = false): Promise<PlayerStatus> {
  try {
    const [player, queue] = await Promise.all([
      ownToneRequest("/api/player"),
      ownToneRequest("/api/queue?id=now_playing")
    ]);
    const item = queue?.items?.[0];
    const catalogSong =
      typeof item?.path === "string"
        ? findSongByFilename(path.basename(item.path))
        : null;
    if (
      player.state === "play" &&
      catalogSong?.endMs &&
      (player.item_progress_ms ?? 0) >= catalogSong.endMs
    ) {
      await ownToneRequest("/api/player/stop", { method: "PUT" }, true);
      player.state = "stop";
      player.item_progress_ms = 0;
    }
    const settings = getPlaybackSettings();
    const compensation = catalogSong
      ? songCompensation(catalogSong, settings)
      : null;
    return {
      backend: "owntone",
      connected: true,
      state: player.state,
      volume: settings.masterVolume,
      maxVolume: config.maxVolume,
      effectiveVolume: Math.min(player.volume ?? 0, config.maxVolume),
      progressMs: player.item_progress_ms ?? 0,
      durationMs: player.item_length_ms ?? item?.length_ms ?? 0,
      song: catalogSong
        ? {
            id: catalogSong.id,
            title: catalogSong.title,
            artist: catalogSong.artist,
            coverUrl: catalogSong.coverUrl
          }
        : item
        ? {
            id: String(item.track_id ?? item.id),
            title: item.title ?? "Unknown song",
            artist: item.artist ?? "",
            coverUrl: null
          }
        : null,
      trim: catalogSong
        ? { startMs: catalogSong.startMs, endMs: catalogSong.endMs }
        : null,
      compensation
    };
  } catch (error) {
    if (strict) throw error;
    const settings = getPlaybackSettings();
    return {
      backend: "owntone",
      connected: false,
      state: "stop",
      volume: settings.masterVolume,
      maxVolume: config.maxVolume,
      effectiveVolume: 0,
      progressMs: 0,
      durationMs: 0,
      song: null,
      trim: null,
      compensation: null,
      message: error instanceof Error ? error.message : "OwnTone is unavailable."
    };
  }
}

async function selectConfiguredOutput() {
  if (!config.ownToneOutputId) return;
  await ownToneRequest(
    "/api/outputs/set",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outputs: [config.ownToneOutputId] })
    },
    true
  );
}

async function findOwnToneTrackUri(filename: string) {
  const directory = encodeURIComponent(config.ownToneMediaDirectory);
  const library = await ownToneRequest(
    `/api/library/files?directory=${directory}`
  );
  const item = library?.tracks?.items?.find(
    (track: { path?: string }) => path.basename(track.path ?? "") === filename
  );
  if (!item?.uri) {
    throw new VoiceOperationError("speaker_track_missing");
  }
  return item.uri as string;
}

export async function getPlayerStatus(): Promise<PlayerStatus> {
  if (config.playbackBackend === "owntone") return ownToneStatus();
  if (config.playbackBackend === "mock") return mockStatus();
  return disabledStatus();
}

export async function playSong(song: Song, options: { signal?: AbortSignal } = {}) {
  options.signal?.throwIfAborted();
  const settings = getPlaybackSettings();
  const compensation = songCompensation(song, settings);
  const adjustedVolume = effectiveVolume(
    settings.masterVolume,
    compensation.totalGainDb,
    settings.curveDivisor
  );
  if (config.playbackBackend === "mock") {
    mock.state = "play";
    mock.song = song;
    mock.volume = adjustedVolume;
    mock.durationMs = song.durationMs || 180_000;
    mock.progressMs = song.startMs;
    mock.startedAt = Date.now();
    const status = mockStatus();
    if (status.state === "play") startEndMonitor();
    return status;
  }
  if (config.playbackBackend === "disabled") {
    throw new Error(
      "External speaker playback is disabled. Select kiosk-device playback or configure OwnTone."
    );
  }

  const signal = options.signal ?? new AbortController().signal;
  await waitForOwnToneLibraryIdle(signal, Date.now() + 10000);
  await selectConfiguredOutput();
  options.signal?.throwIfAborted();
  await setOwnToneVolume(adjustedVolume);
  const uri = await findOwnToneTrackUri(song.filename);
  options.signal?.throwIfAborted();
  const params = new URLSearchParams({
    uris: uri,
    clear: "true",
    playback: "start",
    shuffle: "false"
  });
  await ownToneRequest(`/api/queue/items/add?${params}`, { method: "POST" });
  if (song.startMs > 0) {
    const seek = new URLSearchParams({ position_ms: String(song.startMs) });
    await ownToneRequest(`/api/player/seek?${seek}`, { method: "PUT" }, true);
  }
  // Queue mutation can finish before the player changes state. Confirm both the
  // selected track and transport state instead of reporting a paused song as playing.
  const startedAt = Date.now();
  let resumed = false;
  while (true) {
    signal.throwIfAborted();
    const status = await ownToneStatus(true);
    signal.throwIfAborted();
    if (status.state === "play" && status.song?.id === song.id) {
      startEndMonitor();
      return status;
    }
    const elapsed = Date.now() - startedAt;
    if (elapsed >= 4000) throw new VoiceOperationError("speaker_not_playing");
    if (
      !resumed &&
      elapsed >= 400 &&
      status.state === "pause" &&
      status.song?.id === song.id
    ) {
      // Resume only this request's selected song, once. Never replay the queue
      // mutation after a 500, or resume a different track during cancellation.
      signal.throwIfAborted();
      resumed = true;
      await ownToneRequest("/api/player/play", { method: "PUT" }, true);
    }
    await abortableDelay(200, signal);
  }
}

async function setOwnToneVolume(volume: number) {
  const params = new URLSearchParams({ volume: String(volume) });
  await ownToneRequest(`/api/player/volume?${params}`, { method: "PUT" }, true);
}

async function currentOwnToneSong() {
  const queue = await ownToneRequest("/api/queue?id=now_playing");
  const item = queue?.items?.[0];
  return typeof item?.path === "string"
    ? findSongByFilename(path.basename(item.path))
    : null;
}

export async function playerAction(input: {
  action: "play" | "pause" | "stop" | "volume" | "seek";
  volume?: number;
  positionMs?: number;
}) {
  if (config.playbackBackend === "disabled") return disabledStatus();
  if (config.playbackBackend === "mock") {
    if (input.action === "play" && mock.song) {
      if (
        mock.state === "stop" ||
        mock.progressMs < mock.song.startMs ||
        (mock.song.endMs !== null && mock.progressMs >= mock.song.endMs)
      ) {
        mock.progressMs = mock.song.startMs;
      }
      mock.state = "play";
      mock.startedAt = Date.now();
    } else if (input.action === "pause" && mock.state === "play") {
      mock.progressMs = mockProgress();
      mock.startedAt = null;
      mock.state = "pause";
    } else if (input.action === "stop") {
      mock.state = "stop";
      mock.progressMs = 0;
      mock.startedAt = null;
    } else if (input.action === "volume") {
      const settings = updatePlaybackSettings({
        masterVolume: Math.max(
          0,
          Math.min(config.maxVolume, Math.round(input.volume ?? 0))
        )
      });
      const compensation = mock.song
        ? songCompensation(mock.song, settings)
        : null;
      mock.volume = effectiveVolume(
        settings.masterVolume,
        compensation?.totalGainDb ?? 0,
        settings.curveDivisor
      );
    } else if (input.action === "seek" && mock.song) {
      const upperBound = mock.song.endMs ?? mock.durationMs;
      mock.progressMs = Math.max(
        mock.song.startMs,
        Math.min(upperBound, Math.round(input.positionMs ?? mock.progressMs))
      );
      if (mock.state === "play") mock.startedAt = Date.now();
    }
    const status = mockStatus();
    if (status.state === "play") startEndMonitor();
    else stopEndMonitor();
    return status;
  }

  if (input.action === "pause") {
    const current = await ownToneStatus();
    if (!current.connected || current.state !== "play") return current;
  }

  if (input.action === "volume") {
    const masterVolume = Math.max(
      0,
      Math.min(config.maxVolume, Math.round(input.volume ?? 0))
    );
    const settings = updatePlaybackSettings({ masterVolume });
    const song = await currentOwnToneSong();
    const compensation = song ? songCompensation(song, settings) : null;
    await setOwnToneVolume(
      effectiveVolume(
        masterVolume,
        compensation?.totalGainDb ?? 0,
        settings.curveDivisor
      )
    );
  } else if (input.action === "seek") {
    const song = await currentOwnToneSong();
    const lowerBound = song?.startMs ?? 0;
    const upperBound = song?.endMs ?? song?.durationMs ?? Number.MAX_SAFE_INTEGER;
    const positionMs = Math.max(
      lowerBound,
      Math.min(upperBound, Math.round(input.positionMs ?? lowerBound))
    );
    const params = new URLSearchParams({ position_ms: String(positionMs) });
    await ownToneRequest(`/api/player/seek?${params}`, { method: "PUT" }, true);
  } else if (input.action === "play") {
    const [player, song] = await Promise.all([
      ownToneRequest("/api/player"),
      currentOwnToneSong()
    ]);
    await ownToneRequest("/api/player/play", { method: "PUT" }, true);
    if (
      song &&
      (player.state === "stop" ||
        (player.item_progress_ms ?? 0) < song.startMs ||
        (song.endMs !== null &&
          (player.item_progress_ms ?? 0) >= song.endMs))
    ) {
      const params = new URLSearchParams({
        position_ms: String(song.startMs)
      });
      await ownToneRequest(`/api/player/seek?${params}`, { method: "PUT" }, true);
    }
  } else {
    await ownToneRequest(
      `/api/player/${input.action}`,
      { method: "PUT" },
      true
    );
  }
  const status = await ownToneStatus();
  if (status.state === "play") startEndMonitor();
  else stopEndMonitor();
  return status;
}

export async function triggerOwnToneScan() {
  if (config.playbackBackend !== "owntone") return;
  await ownToneRequest("/api/update", { method: "PUT" }, true);
}

export async function waitForOwnToneSong(song: Song, signal: AbortSignal) {
  if (config.playbackBackend !== "owntone") return;
  const deadline = Date.now() + 30_000;
  let requestedScan = false;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    await waitForOwnToneLibraryIdle(signal, deadline);
    try {
      await findOwnToneTrackUri(song.filename);
      signal.throwIfAborted();
      return;
    } catch (error) {
      if (
        !(error instanceof VoiceOperationError) ||
        error.code !== "speaker_track_missing"
      )
        throw error;
      if (!requestedScan) {
        signal.throwIfAborted();
        await triggerOwnToneScan();
        requestedScan = true;
      }
      await abortableDelay(500, signal);
    }
  }
  throw new VoiceOperationError("speaker_index_timeout");
}

async function waitForOwnToneLibraryIdle(signal: AbortSignal, deadline: number) {
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    const library = await ownToneRequest("/api/library");
    signal.throwIfAborted();
    if (typeof library?.updating !== "boolean")
      throw new VoiceOperationError(
        "invalid_response", undefined, undefined, "library_status"
      );
    if (!library.updating) return;
    await abortableDelay(250, signal);
  }
  throw new VoiceOperationError("speaker_scan_timeout");
}
