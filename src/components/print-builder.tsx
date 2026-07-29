"use client";

import {
  ArrowLeft,
  Check,
  Image as ImageIcon,
  Layers2,
  Music2,
  Printer
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  formatCardRange,
  parseCardRange
} from "@/lib/card-selection";
import {
  makePrintSheets,
  mirrorPrintRows,
  printDensityOptions,
  printSheetColumns,
  type PrintDensity
} from "@/lib/print-layout";
import type { SongCard } from "@/lib/types";

function MarkerCard({ card }: { card: SongCard | null }) {
  if (!card) return <article className="print-card print-card--blank" />;
  return (
    <article className="print-card">
      <div className="print-card__title">
        <strong>{card.title}</strong>
        <span>{card.artist || "Song card"}</span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="print-marker"
        src={`/api/markers/${card.markerId}`}
        alt={`Marker ${card.markerId}`}
      />
      <small>SONG CARD · {String(card.markerId).padStart(3, "0")}</small>
    </article>
  );
}

function CoverCard({ card }: { card: SongCard | null }) {
  if (!card) return <article className="print-card print-card--blank" />;
  return (
    <article className="print-card print-card--back">
      <div className="print-card__cover">
        {card.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.coverUrl} alt="" />
        ) : (
          <ImageIcon size={40} strokeWidth={1.8} aria-hidden="true" />
        )}
      </div>
    </article>
  );
}

export function PrintBuilder({ cards }: { cards: SongCard[] }) {
  const [density, setDensity] = useState<PrintDensity>(9);
  const [duplex, setDuplex] = useState(false);
  const [selectedIds, setSelectedIds] = useState(
    () => new Set(cards.map((card) => card.id))
  );
  const [rangeText, setRangeText] = useState(() =>
    cards.length ? formatCardRange(cards.map((_, index) => index + 1)) : ""
  );
  const [rangeError, setRangeError] = useState("");

  const selectedCards = useMemo(
    () => cards.filter((card) => selectedIds.has(card.id)),
    [cards, selectedIds]
  );
  const sheets = useMemo(
    () => makePrintSheets(selectedCards, density),
    [density, selectedCards]
  );
  const columns = printSheetColumns(density);

  function commitSelection(next: Set<string>) {
    setSelectedIds(next);
    setRangeText(
      formatCardRange(
        cards.flatMap((card, index) =>
          next.has(card.id) ? [index + 1] : []
        )
      )
    );
    setRangeError("");
  }

  function applyRange(event: React.FormEvent) {
    event.preventDefault();
    try {
      const indices = parseCardRange(rangeText, cards.length);
      commitSelection(
        new Set(indices.map((index) => cards[index - 1].id))
      );
    } catch (error) {
      setRangeError(
        error instanceof Error ? error.message : "That range is not valid."
      );
    }
  }

  function toggleCard(cardId: string) {
    const next = new Set(selectedIds);
    if (next.has(cardId)) next.delete(cardId);
    else next.add(cardId);
    commitSelection(next);
  }

  return (
    <main className="print-page">
      <div className="print-builder-controls">
        <header className="print-builder-header">
          <Link className="print-back-link" href="/admin/library">
            <ArrowLeft size={18} />
            Songs
          </Link>
          <div>
            <span className="section-kicker">Print studio</span>
            <h1>Build your card sheets.</h1>
            <p>
              Choose the songs, page density, and whether to print cover
              artwork on the reverse.
            </p>
          </div>
        </header>

        <section className="print-config" aria-label="Print settings">
          <div className="print-config__group">
            <span className="print-config__label">Cards per page</span>
            <div className="density-options">
              {printDensityOptions.map((option) => (
                <button
                  className={density === option ? "is-selected" : ""}
                  type="button"
                  aria-pressed={density === option}
                  key={option}
                  onClick={() => setDensity(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <button
            className={`duplex-toggle ${duplex ? "is-selected" : ""}`}
            type="button"
            aria-pressed={duplex}
            onClick={() => setDuplex((current) => !current)}
          >
            <Layers2 size={21} />
            <span>
              <strong>Cover backs</strong>
              <small>{duplex ? "Double-sided on" : "Single-sided"}</small>
            </span>
            <i aria-hidden="true" />
          </button>

          <div className="print-config__summary">
            <strong>{selectedCards.length}</strong>
            <span>
              selected · {sheets.length * (duplex ? 2 : 1)} print pages
            </span>
          </div>

          <button
            className="print-trigger"
            type="button"
            disabled={selectedCards.length === 0}
            onClick={() => window.print()}
          >
            <Printer size={19} />
            Print sheets
          </button>
        </section>

        {duplex && (
          <p className="print-note">
            In the print dialog, enable two-sided printing and choose
            <strong> flip on long edge</strong>.
          </p>
        )}

        <section className="print-picker" aria-labelledby="choose-cards">
          <div className="print-picker__heading">
            <div>
              <h2 id="choose-cards">Choose cards</h2>
              <p>
                The range numbers match the numbered songs below and define
                their print order.
              </p>
            </div>
            <div className="print-picker__bulk">
              <button
                type="button"
                onClick={() =>
                  commitSelection(new Set(cards.map((card) => card.id)))
                }
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => commitSelection(new Set())}
              >
                Clear
              </button>
            </div>
          </div>

          <form className="print-range" onSubmit={applyRange}>
            <label htmlFor="card-range">Card range</label>
            <div>
              <input
                id="card-range"
                value={rangeText}
                placeholder="1-3, 7-10"
                inputMode="text"
                autoComplete="off"
                disabled={cards.length === 0}
                onChange={(event) => {
                  setRangeText(event.target.value);
                  setRangeError("");
                }}
              />
              <button type="submit" disabled={cards.length === 0}>
                Apply
              </button>
            </div>
            <span className="print-range__hint">
              Examples: 1, 2, 3 · 1-3 · 1-3, 7-10
            </span>
            {rangeError && (
              <span className="print-range__error" role="alert">
                {rangeError}
              </span>
            )}
          </form>

          <div className="print-song-grid">
            {cards.map((card, index) => {
              const selected = selectedIds.has(card.id);
              return (
                <button
                  className={`print-song-option ${
                    selected ? "is-selected" : ""
                  }`}
                  type="button"
                  aria-pressed={selected}
                  key={card.id}
                  onClick={() => toggleCard(card.id)}
                >
                  <span className="print-song-option__number">
                    {index + 1}
                  </span>
                  <span className="print-song-option__art">
                    {card.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={card.coverUrl} alt="" />
                    ) : (
                      <Music2 size={24} aria-hidden="true" />
                    )}
                  </span>
                  <span className="print-song-option__copy">
                    <strong>{card.title}</strong>
                    <small>{card.artist || `Marker ${card.markerId}`}</small>
                  </span>
                  <span className="print-song-option__check">
                    {selected && <Check size={17} strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="print-preview-heading">
          <div>
            <span className="section-kicker">Preview</span>
            <h2>
              {selectedCards.length
                ? `${selectedCards.length} cards ready`
                : "Select at least one card"}
            </h2>
          </div>
          <span>A4 portrait · {density} per page</span>
        </div>
      </div>

      <div className="print-preview-scroll">
        <div className="print-sheets">
          {sheets.flatMap((sheet, sheetIndex) => {
            const sheetClass = `print-sheet print-sheet--${density}`;
            const front = (
              <section
                className={sheetClass}
                key={`front-${sheetIndex}`}
                aria-label={`Marker sheet ${sheetIndex + 1}`}
              >
                <span className="print-sheet__label">
                  Front {sheetIndex + 1}
                </span>
                {sheet.map((card, index) => (
                  <MarkerCard
                    card={card}
                    key={
                      card
                        ? `front-${card.id}`
                        : `front-blank-${index}`
                    }
                  />
                ))}
              </section>
            );
            if (!duplex) return [front];
            const backs = mirrorPrintRows(sheet, columns);
            return [
              front,
              <section
                className={`${sheetClass} print-sheet--backs`}
                key={`back-${sheetIndex}`}
                aria-label={`Cover sheet ${sheetIndex + 1}`}
              >
                <span className="print-sheet__label">
                  Back {sheetIndex + 1}
                </span>
                {backs.map((card, index) => (
                  <CoverCard
                    card={card}
                    key={
                      card
                        ? `back-${card.id}`
                        : `back-blank-${index}`
                    }
                  />
                ))}
              </section>
            ];
          })}
        </div>
      </div>
    </main>
  );
}
