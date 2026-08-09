import path from "node:path";
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
  const response = await fetch(`${config.ownToneUrl}${pathname}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(5_000)
  });
  if (!response.ok) {
    throw new Error(`OwnTone returned ${response.status} for ${pathname}.`);
  }
  if (allowEmpty || response.status === 204) return null;
  return response.json();
}

async function ownToneStatus(): Promise<PlayerStatus> {
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
    throw new Error(
      "The uploaded song is not indexed by OwnTone yet. Try again after its library scan."
    );
  }
  return item.uri as string;
}

export async function getPlayerStatus(): Promise<PlayerStatus> {
  if (config.playbackBackend === "owntone") return ownToneStatus();
  if (config.playbackBackend === "mock") return mockStatus();
  return disabledStatus();
}

export async function playSong(song: Song) {
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

  await selectConfiguredOutput();
  await setOwnToneVolume(adjustedVolume);
  const uri = await findOwnToneTrackUri(song.filename);
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
  const status = await ownToneStatus();
  if (status.state === "play") startEndMonitor();
  return status;
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
