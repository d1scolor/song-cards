"use client";

import {
  Brackets,
  CirclePause,
  CirclePlay,
  Square,
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
  onStatus,
  allowTrimEditing = false
}: {
  compact?: boolean;
  onStatus?: (status: PlayerStatus) => void;
  allowTrimEditing?: boolean;
}) {
  const [status, setStatus] = useState<PlayerStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [trimMessage, setTrimMessage] = useState("");
  const [seeking, setSeeking] = useState(false);
  const [seekPreviewMs, setSeekPreviewMs] = useState(0);

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
        maxVolume: 100,
        effectiveVolume: 0,
        progressMs: 0,
        durationMs: 0,
        song: null,
        trim: null,
        compensation: null,
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
      | { action: "seek"; positionMs: number }
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

  async function setPlaybackPoint(
    point: "startMs" | "endMs",
    value: number | null
  ) {
    if (!status?.song) return;
    setBusy(true);
    setTrimMessage("");
    try {
      const response = await fetch(
        `/api/admin/catalog/${encodeURIComponent(status.song.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ [point]: value })
        }
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setStatus((current) =>
        current
          ? {
              ...current,
              trim: {
                startMs: body.song.startMs,
                endMs: body.song.endMs
              }
            }
          : current
      );
      setTrimMessage(
        value === null
          ? "Ending point cleared."
          : `${point === "startMs" ? "Start" : "End"} set to ${formatTime(value)}.`
      );
    } catch (error) {
      setTrimMessage(
        error instanceof Error ? error.message : "Unable to set playback point."
      );
    } finally {
      setBusy(false);
    }
  }

  const progress =
    status?.durationMs && status.durationMs > 0
      ? Math.min(100, (status.progressMs / status.durationMs) * 100)
      : 0;
  const displayedProgressMs = seeking
    ? seekPreviewMs
    : (status?.progressMs ?? 0);
  const seekMinimum = status?.trim?.startMs ?? 0;
  const seekMaximum =
    status?.trim?.endMs ?? status?.durationMs ?? seekMinimum;
  const seekProgress =
    seekMaximum > seekMinimum
      ? Math.min(
          100,
          Math.max(
            0,
            ((displayedProgressMs - seekMinimum) /
              (seekMaximum - seekMinimum)) *
              100
          )
        )
      : progress;

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
        <div className="now-playing__art">
          {status?.song?.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={status.song.coverUrl}
              alt={`${status.song.title} cover`}
            />
          ) : (
            <Speaker
              size={compact ? 28 : 38}
              strokeWidth={2.4}
              aria-hidden="true"
            />
          )}
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
          <span>{formatTime(displayedProgressMs)}</span>
          <div
            className="progress-track progress-track--seekable"
            style={{ "--seek-progress": `${seekProgress}%` } as React.CSSProperties}
          >
            <input
              aria-label="Song position"
              type="range"
              min={seekMinimum}
              max={Math.max(seekMinimum, seekMaximum)}
              step="250"
              value={Math.max(
                seekMinimum,
                Math.min(seekMaximum, displayedProgressMs)
              )}
              disabled={
                busy ||
                !status?.song ||
                status.durationMs <= 0 ||
                seekMaximum <= seekMinimum
              }
              onPointerDown={() => {
                setSeeking(true);
                setSeekPreviewMs(status?.progressMs ?? seekMinimum);
              }}
              onChange={(event) => {
                setSeeking(true);
                setSeekPreviewMs(Number(event.target.value));
              }}
              onPointerUp={(event) => {
                const positionMs = Number(event.currentTarget.value);
                setSeeking(false);
                void action({ action: "seek", positionMs });
              }}
              onKeyUp={(event) => {
                const positionMs = Number(event.currentTarget.value);
                setSeeking(false);
                void action({ action: "seek", positionMs });
              }}
            />
          </div>
          <span>{formatTime(seekMaximum)}</span>
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
          <Square
            size={compact ? 22 : 28}
            fill="currentColor"
            strokeWidth={2.5}
          />
        </button>
      </div>

      {!compact && (
        <div className="volume-row">
          <Volume1 size={22} aria-hidden="true" />
          <input
            aria-label="Speaker volume"
            type="range"
            min="0"
            max={status?.maxVolume ?? 100}
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

      {!compact && allowTrimEditing && status?.song && (
        <div className="trim-controls">
          <div className="trim-controls__heading">
            <Brackets size={19} aria-hidden="true" />
            <span>Edit this song while listening</span>
          </div>
          <div className="trim-controls__buttons">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void setPlaybackPoint("startMs", status.progressMs)
              }
            >
              Set start here
              <small>{formatTime(status.trim?.startMs ?? 0)}</small>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void setPlaybackPoint("endMs", status.progressMs)}
            >
              Set end here
              <small>
                {status.trim?.endMs
                  ? formatTime(status.trim.endMs)
                  : "Full song"}
              </small>
            </button>
            {status.trim?.endMs != null && (
              <button
                className="trim-clear"
                type="button"
                disabled={busy}
                onClick={() => void setPlaybackPoint("endMs", null)}
              >
                Clear end
              </button>
            )}
          </div>
          {trimMessage && (
            <p className="trim-message" aria-live="polite">
              {trimMessage}
            </p>
          )}
        </div>
      )}

      {!status?.connected && status?.message && (
        <p className="inline-error">{status.message}</p>
      )}
    </section>
  );
}
