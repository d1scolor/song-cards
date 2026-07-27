import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { isAdminPage } from "@/lib/auth";
import { listSongCards } from "@/lib/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Print cards"
};

export default async function PrintPage() {
  if (!(await isAdminPage())) redirect("/admin/login");
  const cards = listSongCards();

  return (
    <main className="print-page">
      <div className="print-toolbar">
        <div>
          <strong>Song card sheet</strong>
          <span>{cards.length} cards · A4 portrait</span>
        </div>
        <PrintButton />
      </div>
      <section className="print-sheet">
        {cards.map((card) => (
          <article className="print-card" key={card.id}>
            <div className="print-card__title">
              <strong>{card.title}</strong>
              <span>{card.artist || "Song card"}</span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/markers/${card.markerId}`}
              alt={`Marker ${card.markerId}`}
            />
            <small>SONG CARD · {String(card.markerId).padStart(3, "0")}</small>
          </article>
        ))}
      </section>
    </main>
  );
}
