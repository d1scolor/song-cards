"use client";

import { AudioLines, Music2, Plus, Printer, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { SongCard } from "@/lib/types";

export function AdminSongLibrary({
  initialSongs
}: {
  initialSongs: SongCard[];
}) {
  const [songs, setSongs] = useState(initialSongs);
  const [query, setQuery] = useState("");
  const [analysisProgress, setAnalysisProgress] = useState("");
  const [error, setError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const visibleSongs = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return songs;
    return songs.filter((song) =>
      `${song.title} ${song.artist}`.toLocaleLowerCase().includes(normalized)
    );
  }, [query, songs]);
  const pending = songs.filter((song) => song.integratedLufs === null);

  async function analyzeExistingSongs() {
    if (pending.length === 0) return;
    setAnalyzing(true);
    setError("");
    for (let index = 0; index < pending.length; index += 1) {
      const song = pending[index];
      setAnalysisProgress(
        `Analyzing ${index + 1} of ${pending.length}: ${song.title}`
      );
      const response = await fetch(
        `/api/admin/catalog/${encodeURIComponent(song.id)}/analyze`,
        { method: "POST" }
      );
      const body = await response.json();
      if (!response.ok) {
        setError(
          `${song.title}: ${body.error ?? "Unable to analyze the song."}`
        );
        continue;
      }
      setSongs((current) =>
        current.map((item) =>
          item.id === song.id ? { ...item, ...body.song } : item
        )
      );
    }
    setAnalyzing(false);
    setAnalysisProgress("Library analysis is complete.");
  }

  return (
    <main className="admin-shell library-page admin-library-page">
      <section className="library-hero">
        <div>
          <span className="section-kicker">Library</span>
          <h1>Your songs.</h1>
          <p>
            Search the collection, play a song, or open it to adjust playback.
          </p>
        </div>
        <label className="song-search">
          <Search size={22} aria-hidden="true" />
          <span className="sr-only">Search songs</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title or artist"
          />
        </label>
      </section>

      <div className="library-toolbar">
        <span>{songs.length} of 250 markers assigned</span>
        <div>
          {pending.length > 0 && (
            <button
              className="secondary-button"
              type="button"
              disabled={analyzing}
              onClick={() => void analyzeExistingSongs()}
            >
              <AudioLines size={18} aria-hidden="true" />
              {analyzing ? analysisProgress : `Analyze ${pending.length} songs`}
            </button>
          )}
          <Link className="secondary-button" href="/admin/print">
            <Printer size={18} aria-hidden="true" />
            Print
          </Link>
          <Link className="primary-button" href="/admin/add">
            <Plus size={18} aria-hidden="true" />
            Add songs
          </Link>
        </div>
      </div>
      {analysisProgress && !analyzing && (
        <p className="analysis-progress" aria-live="polite">
          {analysisProgress}
        </p>
      )}
      {error && <p className="form-error">{error}</p>}

      {visibleSongs.length > 0 ? (
        <section className="song-grid" aria-label="Songs">
          {visibleSongs.map((song) => (
            <Link
              key={song.id}
              href={`/admin/library/${encodeURIComponent(song.id)}`}
              className="song-tile"
            >
              <span className="song-tile__art">
                {song.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={song.coverUrl} alt="" />
                ) : (
                  <Music2 size={48} aria-hidden="true" />
                )}
              </span>
              <span className="song-tile__copy">
                <strong>{song.title}</strong>
                <span>{song.artist || "Unknown artist"}</span>
                <small>Marker {song.markerId}</small>
              </span>
            </Link>
          ))}
        </section>
      ) : (
        <div className="library-empty">
          <Music2 size={38} aria-hidden="true" />
          <strong>{songs.length ? "No songs found" : "No songs yet"}</strong>
          <span>
            {songs.length
              ? "Try a different title or artist."
              : "Add a song to start building the library."}
          </span>
        </div>
      )}
    </main>
  );
}
