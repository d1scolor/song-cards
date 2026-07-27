import { Image as ImageIcon, Layers2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { isAdminPage } from "@/lib/auth";
import {
  makePrintSheets,
  mirrorPrintRows
} from "@/lib/print-layout";
import { listSongCards } from "@/lib/repository";
import type { SongCard } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Print cards"
};

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
      <div className="print-card__title">
        <strong>{card.title}</strong>
        <span>{card.artist || "Song card"}</span>
      </div>
    </article>
  );
}

export default async function PrintPage({
  searchParams
}: {
  searchParams: Promise<{ duplex?: string | string[] }>;
}) {
  if (!(await isAdminPage())) redirect("/admin/login");
  const cards = listSongCards();
  const duplex = (await searchParams).duplex === "1";
  const sheets = makePrintSheets(cards);

  return (
    <main className="print-page">
      <div className="print-toolbar">
        <div className="print-toolbar__summary">
          <strong>Song card sheet</strong>
          <span>
            {cards.length} cards · A4 portrait
            {duplex ? " · flip on long edge" : ""}
          </span>
        </div>
        <div className="print-toolbar__actions">
          <Link
            className={`print-mode-toggle ${duplex ? "is-active" : ""}`}
            href={duplex ? "/admin/print" : "/admin/print?duplex=1"}
          >
            <Layers2 size={17} />
            {duplex ? "Double-sided on" : "Add cover backs"}
          </Link>
          <PrintButton />
        </div>
      </div>
      {duplex && (
        <p className="print-note">
          In the print dialog, enable two-sided printing and choose
          <strong> flip on long edge</strong>.
        </p>
      )}
      <div className="print-sheets">
        {sheets.flatMap((sheet, sheetIndex) => {
          const front = (
            <section
              className="print-sheet"
              key={`front-${sheetIndex}`}
              aria-label={`Marker sheet ${sheetIndex + 1}`}
            >
              {sheet.map((card, index) => (
                <MarkerCard
                  card={card}
                  key={card ? `front-${card.id}` : `front-blank-${index}`}
                />
              ))}
            </section>
          );
          if (!duplex) return [front];
          const backs = mirrorPrintRows(sheet);
          return [
            front,
            <section
              className="print-sheet print-sheet--backs"
              key={`back-${sheetIndex}`}
              aria-label={`Cover sheet ${sheetIndex + 1}`}
            >
              {backs.map((card, index) => (
                <CoverCard
                  card={card}
                  key={card ? `back-${card.id}` : `back-blank-${index}`}
                />
              ))}
            </section>
          ];
        })}
      </div>
    </main>
  );
}
