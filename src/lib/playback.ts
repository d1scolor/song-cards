import path from "node:path";
import { config } from "@/lib/config";
import type { PlayerStatus, Song } from "@/lib/types";

type MockRuntime = {
  state: "play" | "pause" | "stop";
  volume: number;
  progressMs: number;
  startedAt: number | null;
  durationMs: number;
  song: PlayerStatus["song"];
};

declare global {
  var __songCardsMockPlayer: MockRuntime | undefined;
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

function mockProgress() {
  if (mock.state !== "play" || mock.startedAt === null) return mock.progressMs;
  return Math.min(
    mock.durationMs,
    mock.progressMs + Date.now() - mock.startedAt
  );
}

function mockStatus(): PlayerStatus {
  const progressMs = mockProgress();
  if (progressMs >= mock.durationMs && mock.state === "play") {
    mock.state = "stop";
    mock.progressMs = 0;
    mock.startedAt = null;
  }
  return {
    backend: "mock",
    connected: true,
    state: mock.state,
    volume: mock.volume,
    progressMs: mock.state === "stop" ? 0 : progressMs,
    durationMs: mock.durationMs,
    song: mock.song,
    message: "Mock playback"
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
    return {
      backend: "owntone",
      connected: true,
      state: player.state,
      volume: Math.min(player.volume ?? 0, config.maxVolume),
      progressMs: player.item_progress_ms ?? 0,
      durationMs: player.item_length_ms ?? item?.length_ms ?? 0,
      song: item
        ? {
            id: String(item.track_id ?? item.id),
            title: item.title ?? "Unknown song",
            artist: item.artist ?? ""
          }
        : null
    };
  } catch (error) {
    return {
      backend: "owntone",
      connected: false,
      state: "stop",
      volume: 0,
      progressMs: 0,
      durationMs: 0,
      song: null,
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
  return config.playbackBackend === "owntone"
    ? ownToneStatus()
    : mockStatus();
}

export async function playSong(song: Song) {
  if (config.playbackBackend === "mock") {
    mock.state = "play";
    mock.song = { id: song.id, title: song.title, artist: song.artist };
    mock.progressMs = 0;
    mock.startedAt = Date.now();
    return mockStatus();
  }

  await selectConfiguredOutput();
  const uri = await findOwnToneTrackUri(song.filename);
  const params = new URLSearchParams({
    uris: uri,
    clear: "true",
    playback: "start",
    shuffle: "false"
  });
  await ownToneRequest(`/api/queue/items/add?${params}`, { method: "POST" });
  return ownToneStatus();
}

export async function playerAction(input: {
  action: "play" | "pause" | "stop" | "volume";
  volume?: number;
}) {
  if (config.playbackBackend === "mock") {
    if (input.action === "play" && mock.song) {
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
      mock.volume = Math.max(
        0,
        Math.min(config.maxVolume, Math.round(input.volume ?? mock.volume))
      );
    }
    return mockStatus();
  }

  if (input.action === "volume") {
    const volume = Math.max(
      0,
      Math.min(config.maxVolume, Math.round(input.volume ?? 0))
    );
    const params = new URLSearchParams({ volume: String(volume) });
    await ownToneRequest(`/api/player/volume?${params}`, { method: "PUT" }, true);
  } else {
    await ownToneRequest(
      `/api/player/${input.action}`,
      { method: "PUT" },
      true
    );
  }
  return ownToneStatus();
}

export async function triggerOwnToneScan() {
  if (config.playbackBackend !== "owntone") return;
  await ownToneRequest("/api/update", { method: "PUT" }, true);
}
