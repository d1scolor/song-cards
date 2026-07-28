"use client";

import {
  CheckCircle2,
  LoaderCircle,
  Music2,
  Play
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { SongCard } from "@/lib/types";

type PlayState = "idle" | "starting" | "success" | "error";

export function SongDetail({ song }: { song: SongCard }) {
  const [playState, setPlayState] = useState<PlayState>("idle");
  const [message, setMessage] = useState("");

  async function playCard() {
    setPlayState("starting");
    setMessage("");
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markerId: song.markerId })
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "The song could not be started.");
      }
      setPlayState("success");
      setMessage(`${song.title} is now playing.`);
    } catch (error) {
      setPlayState("error");
      setMessage(
        error instanceof Error ? error.message : "The song could not be started."
      );
    }
  }

  return (
    <section className="song-detail-page">
      <Link href="/library" className="song-detail-back">
        ← Back to library
      </Link>
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
          <span className="section-kicker">Song card</span>
          <h1>{song.title}</h1>
          <p>{song.artist || "Unknown artist"}</p>
        </div>

        <button
          className="primary-button card-play-button"
          type="button"
          onClick={() => void playCard()}
          disabled={playState === "starting"}
        >
          {playState === "starting" ? (
            <LoaderCircle className="spin" size={23} aria-hidden="true" />
          ) : playState === "success" ? (
            <CheckCircle2 size={23} aria-hidden="true" />
          ) : (
            <Play size={23} fill="currentColor" aria-hidden="true" />
          )}
          {playState === "starting"
            ? "Starting…"
            : playState === "success"
              ? "Playing"
              : "Play now"}
        </button>

        <p
          className={`card-play-status ${
            playState === "error" ? "is-error" : ""
          }`}
          aria-live="polite"
        >
          {message ||
            "Or show the marker in the corner to the Song Cards scanner."}
        </p>
      </article>
    </section>
  );
}
