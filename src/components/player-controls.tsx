"use client";

import {
  CirclePause,
  CirclePlay,
  Octagon,
  Speaker,
  Volume1,
  Volume2
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { PlayerStatus } from "@/lib/types";

function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function PlayerControls({
  compact = false,
  onStatus
}: {
  compact?: boolean;
  onStatus?: (status: PlayerStatus) => void;
}) {
  const [status, setStatus] = useState<PlayerStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/player", { cache: "no-store" });
      const next = (await response.json()) as PlayerStatus;
      setStatus(next);
      onStatus?.(next);
    } catch {
      setStatus({
        backend: "mock",
        connected: false,
        state: "stop",
        volume: 0,
        progressMs: 0,
        durationMs: 0,
        song: null,
        message: "The music server is unavailable."
      });
    }
  }, [onStatus]);

  useEffect(() => {
    const firstLoad = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(load, 1_000);
    return () => {
      window.clearTimeout(firstLoad);
      window.clearInterval(timer);
    };
  }, [load]);

  async function action(
    input:
      | { action: "play" | "pause" | "stop" }
      | { action: "volume"; volume: number }
  ) {
    setBusy(true);
    try {
      const response = await fetch("/api/player/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setStatus(body);
      onStatus?.(body);
    } finally {
      setBusy(false);
    }
  }

  const progress =
    status?.durationMs && status.durationMs > 0
      ? Math.min(100, (status.progressMs / status.durationMs) * 100)
      : 0;

  return (
    <section className={`player-panel ${compact ? "player-panel--compact" : ""}`}>
      <div className="player-heading">
        <span
          className={`connection-dot ${status?.connected ? "is-online" : ""}`}
          aria-hidden="true"
        />
        <span>{status?.connected ? "Speaker ready" : "Speaker unavailable"}</span>
        {status?.backend === "mock" && <span className="demo-chip">Demo</span>}
      </div>

      <div className="now-playing">
        <div className="now-playing__art" aria-hidden="true">
          <Speaker size={compact ? 28 : 38} strokeWidth={2.4} />
        </div>
        <div className="now-playing__copy">
          <span className="eyebrow">
            {status?.state === "play"
              ? "Now playing"
              : status?.state === "pause"
                ? "Paused"
                : "Ready"}
          </span>
          <strong>{status?.song?.title ?? "Choose a song card"}</strong>
          <span>{status?.song?.artist || "Nothing playing yet"}</span>
        </div>
      </div>

      {!compact && (
        <div className="progress-row">
          <span>{formatTime(status?.progressMs ?? 0)}</span>
          <div className="progress-track" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </div>
          <span>{formatTime(status?.durationMs ?? 0)}</span>
        </div>
      )}

      <div className="transport-row">
        <button
          className="round-control"
          type="button"
          aria-label={status?.state === "play" ? "Pause" : "Play"}
          disabled={busy || !status?.song}
          onClick={() =>
            void action({
              action: status?.state === "play" ? "pause" : "play"
            })
          }
        >
          {status?.state === "play" ? (
            <CirclePause size={compact ? 44 : 54} />
          ) : (
            <CirclePlay size={compact ? 44 : 54} />
          )}
        </button>
        <button
          className="round-control round-control--stop"
          type="button"
          aria-label="Stop"
          disabled={busy || !status?.song}
          onClick={() => void action({ action: "stop" })}
        >
          <Octagon size={compact ? 35 : 42} />
        </button>
      </div>

      {!compact && (
        <div className="volume-row">
          <Volume1 size={22} aria-hidden="true" />
          <input
            aria-label="Speaker volume"
            type="range"
            min="0"
            max="100"
            value={status?.volume ?? 0}
            disabled={busy || !status?.connected}
            onChange={(event) => {
              const volume = Number(event.target.value);
              setStatus((current) =>
                current ? { ...current, volume } : current
              );
            }}
            onPointerUp={(event) =>
              void action({
                action: "volume",
                volume: Number(event.currentTarget.value)
              })
            }
            onKeyUp={(event) =>
              void action({
                action: "volume",
                volume: Number(event.currentTarget.value)
              })
            }
          />
          <Volume2 size={24} aria-hidden="true" />
          <output>{status?.volume ?? 0}%</output>
        </div>
      )}

      {!status?.connected && status?.message && (
        <p className="inline-error">{status.message}</p>
      )}
    </section>
  );
}
