"use client";

import {
  AudioLines,
  CheckCircle2,
  LoaderCircle,
  Music2,
  Play,
  Smartphone,
  Trash2
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import {
  type LocalPlaybackTrack,
  useLocalPlayback
} from "@/components/local-playback";
import type { PlaybackSettings, SongCard } from "@/lib/types";

type PlayState = "idle" | "starting" | "success" | "error";

function formatSeconds(milliseconds: number | null) {
  if (milliseconds === null) return "";
  return (milliseconds / 1_000).toFixed(3).replace(/\.?0+$/, "");
}

function automaticGain(song: SongCard, settings: PlaybackSettings) {
  if (
    !settings.loudnessCompensationEnabled ||
    song.integratedLufs === null ||
    song.shortTermP95Lufs === null
  ) {
    return 0;
  }
  return (
    Math.round(
      Math.min(
        settings.integratedTargetLufs - song.integratedLufs,
        settings.shortTermTargetLufs - song.shortTermP95Lufs
      ) * 10
    ) / 10
  );
}

export function AdminSongDetail({
  initialSong,
  playbackSettings,
  maxVolume,
  speakerPlaybackEnabled
}: {
  initialSong: SongCard;
  playbackSettings: PlaybackSettings;
  maxVolume: number;
  speakerPlaybackEnabled: boolean;
}) {
  const router = useRouter();
  const localPlayer = useLocalPlayback();
  const [song, setSong] = useState(initialSong);
  const [playState, setPlayState] = useState<PlayState>("idle");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const automatic = automaticGain(song, playbackSettings);
  const localTrack = useMemo<LocalPlaybackTrack>(
    () => ({
      id: song.id,
      title: song.title,
      artist: song.artist,
      coverUrl: song.coverUrl,
      mediaUrl: `/api/admin/media/${encodeURIComponent(song.id)}`,
      durationMs: song.durationMs,
      startMs: song.startMs,
      endMs: song.endMs,
      masterVolume: playbackSettings.masterVolume,
      maxVolume,
      curveDivisor: playbackSettings.curveDivisor,
      totalGainDb: Math.round((automatic + song.manualGainDb) * 10) / 10
    }),
    [automatic, maxVolume, playbackSettings, song]
  );

  async function playOnSpeaker() {
    setPlayState("starting");
    setMessage("");
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          markerId: song.markerId,
          playbackTarget: "owntone"
        })
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "The song could not be started.");
      }
      setPlayState("success");
      setMessage(`${song.title} is now playing through OwnTone.`);
    } catch (error) {
      setPlayState("error");
      setMessage(
        error instanceof Error ? error.message : "The song could not be started."
      );
    }
  }

  async function playOnDevice() {
    setPlayState("starting");
    setMessage("");
    try {
      await localPlayer.playTrack(localTrack);
      setPlayState("success");
      setMessage(`${song.title} is playing on this device.`);
    } catch {
      setPlayState("error");
      setMessage("Local playback could not be started on this device.");
    }
  }

  async function savePlayback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const endValue = String(form.get("endSeconds") ?? "").trim();
    const response = await fetch(`/api/admin/catalog/${song.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        manualGainDb: Number(form.get("manualGainDb")),
        startMs: Math.round(Number(form.get("startSeconds")) * 1_000),
        endMs: endValue ? Math.round(Number(endValue) * 1_000) : null
      })
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) {
      setMessage(body.error ?? "Unable to save playback settings.");
      return;
    }
    setSong((current) => ({ ...current, ...body.song }));
    setMessage("Playback settings saved.");
  }

  async function analyze() {
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/admin/catalog/${song.id}/analyze`, {
      method: "POST"
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) {
      setMessage(body.error ?? "Unable to analyze the song.");
      return;
    }
    setSong((current) => ({ ...current, ...body.song }));
    setMessage("Loudness analysis updated. Manual correction was preserved.");
  }

  async function removeSong() {
    if (!window.confirm(`Remove “${song.title}” and its files?`)) return;
    setBusy(true);
    const response = await fetch(`/api/admin/catalog/${song.id}`, {
      method: "DELETE"
    });
    if (!response.ok) {
      const body = await response.json();
      setMessage(body.error ?? "Unable to remove the song.");
      setBusy(false);
      return;
    }
    if (localPlayer.track?.id === song.id) localPlayer.stop();
    router.push("/admin/library");
    router.refresh();
  }

  return (
    <main className="admin-shell admin-song-detail">
      <Link href="/admin/library" className="song-detail-back">
        ← Back to library
      </Link>
      <section className="admin-detail-grid">
        <article className="card-showcase">
          <div className="card-showcase__art">
            {song.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={song.coverUrl} alt={`${song.title} cover`} />
            ) : (
              <Music2 size={96} aria-hidden="true" />
            )}
            <div className="card-showcase__marker">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/markers/${song.markerId}`}
                alt={`Scannable marker for ${song.title}`}
              />
            </div>
          </div>
          <div className="card-showcase__copy">
            <span className="section-kicker">Marker {song.markerId}</span>
            <h1>{song.title}</h1>
            <p>{song.artist || "Unknown artist"}</p>
          </div>
          <div className="song-play-actions">
            {speakerPlaybackEnabled && (
              <button
                className="primary-button"
                type="button"
                onClick={() => void playOnSpeaker()}
                disabled={playState === "starting"}
              >
                {playState === "starting" ? (
                  <LoaderCircle className="spin" size={21} aria-hidden="true" />
                ) : playState === "success" ? (
                  <CheckCircle2 size={21} aria-hidden="true" />
                ) : (
                  <Play size={21} fill="currentColor" aria-hidden="true" />
                )}
                OwnTone speaker
              </button>
            )}
            <button
              className={
                speakerPlaybackEnabled ? "secondary-button" : "primary-button"
              }
              type="button"
              onClick={() => void playOnDevice()}
              disabled={playState === "starting"}
            >
              <Smartphone size={21} aria-hidden="true" />
              This device
            </button>
          </div>
          {message && (
            <p
              className={`card-play-status ${
                playState === "error" ? "is-error" : ""
              }`}
              aria-live="polite"
            >
              {message}
            </p>
          )}
        </article>

        <section className="surface playback-setup-panel">
          <div className="surface-heading">
            <span className="step-number">
              <AudioLines size={18} aria-hidden="true" />
            </span>
            <div>
              <h2>Playback setup</h2>
              <p>Adjust balancing and the playable section without editing audio.</p>
            </div>
          </div>
          <div className="catalog-analysis">
            {song.integratedLufs !== null ? (
              <>
                <span>
                  Average <strong>{song.integratedLufs} LUFS</strong>
                </span>
                <span>
                  Loud sections <strong>{song.shortTermP95Lufs} LUFS</strong>
                </span>
                <span>
                  Automatic{" "}
                  <strong>
                    {automatic > 0 ? "+" : ""}
                    {automatic} dB
                  </strong>
                </span>
              </>
            ) : (
              <span>
                {song.analysisError || "This song has not been analyzed yet."}
              </span>
            )}
          </div>
          <form className="song-tuning-form" onSubmit={savePlayback}>
            <label>
              Manual correction
              <span>
                <input
                  name="manualGainDb"
                  type="number"
                  min="-12"
                  max="12"
                  step="0.5"
                  defaultValue={song.manualGainDb}
                  key={`${song.id}-gain-${song.manualGainDb}`}
                />
                dB
              </span>
            </label>
            <label>
              Start at
              <span>
                <input
                  name="startSeconds"
                  type="number"
                  min="0"
                  max={song.durationMs / 1_000 || undefined}
                  step="0.001"
                  defaultValue={formatSeconds(song.startMs)}
                  key={`${song.id}-start-${song.startMs}`}
                />
                sec
              </span>
            </label>
            <label>
              End at
              <span>
                <input
                  name="endSeconds"
                  type="number"
                  min="0.001"
                  max={song.durationMs / 1_000 || undefined}
                  step="0.001"
                  placeholder={
                    song.durationMs
                      ? formatSeconds(song.durationMs)
                      : "Full song"
                  }
                  defaultValue={formatSeconds(song.endMs)}
                  key={`${song.id}-end-${song.endMs}`}
                />
                sec
              </span>
            </label>
            <div className="song-tuning-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={busy}
                onClick={() => void analyze()}
              >
                <AudioLines size={17} aria-hidden="true" />
                {song.analyzedAt ? "Analyze again" : "Analyze"}
              </button>
              <button className="primary-button" type="submit" disabled={busy}>
                Save playback
              </button>
            </div>
          </form>
          <button
            className="delete-song-button"
            type="button"
            disabled={busy}
            onClick={() => void removeSong()}
          >
            <Trash2 size={18} aria-hidden="true" />
            Remove song and free marker {song.markerId}
          </button>
        </section>
      </section>
    </main>
  );
}
