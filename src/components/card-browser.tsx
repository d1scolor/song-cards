"use client";

import { Music2, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { SongCard } from "@/lib/types";

export function CardBrowser({ cards }: { cards: SongCard[] }) {
  const [query, setQuery] = useState("");
  const visibleCards = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return cards;
    return cards.filter((card) =>
      `${card.title} ${card.artist}`.toLocaleLowerCase().includes(normalizedQuery)
    );
  }, [cards, query]);

  return (
    <main className="cards-page">
      <header className="cards-header">
        <Link href="/play" className="dashboard-brand">
          <span className="brand-mark" aria-hidden="true">
            <Music2 size={25} />
          </span>
          <span>Song Cards</span>
        </Link>
        <Link className="text-link" href="/control">
          Player controls
        </Link>
      </header>

      <section className="cards-hero">
        <span className="section-kicker">Song library</span>
        <h1>Pick something to play.</h1>
        <label className="card-search">
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

      {visibleCards.length > 0 ? (
        <section className="cards-grid" aria-label="Songs">
          {visibleCards.map((card) => (
            <Link
              key={card.id}
              href={`/cards/${encodeURIComponent(card.id)}`}
              className="library-card"
            >
              <span className="library-card__art">
                {card.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card.coverUrl} alt="" />
                ) : (
                  <Music2 size={48} aria-hidden="true" />
                )}
              </span>
              <span className="library-card__copy">
                <strong>{card.title}</strong>
                <span>{card.artist || "Unknown artist"}</span>
              </span>
            </Link>
          ))}
        </section>
      ) : (
        <div className="cards-empty">
          <Music2 size={38} aria-hidden="true" />
          <strong>No songs found</strong>
          <span>Try a different title or artist.</span>
        </div>
      )}
    </main>
  );
}
