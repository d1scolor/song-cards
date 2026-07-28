"use client";

import { Music2, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { SongCard } from "@/lib/types";

export function SongLibrary({ songs }: { songs: SongCard[] }) {
  const [query, setQuery] = useState("");
  const visibleSongs = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return songs;
    return songs.filter((song) =>
      `${song.title} ${song.artist}`.toLocaleLowerCase().includes(normalizedQuery)
    );
  }, [query, songs]);

  return (
    <>
      <section className="library-hero">
        <span className="section-kicker">Song library</span>
        <h1>Pick something to play.</h1>
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

      {visibleSongs.length > 0 ? (
        <section className="song-grid" aria-label="Songs">
          {visibleSongs.map((song) => (
            <Link
              key={song.id}
              href={`/library/${encodeURIComponent(song.id)}`}
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
              </span>
            </Link>
          ))}
        </section>
      ) : (
        <div className="library-empty">
          <Music2 size={38} aria-hidden="true" />
          <strong>No songs found</strong>
          <span>Try a different title or artist.</span>
        </div>
      )}
    </>
  );
}
