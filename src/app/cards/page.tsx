import type { Metadata } from "next";
import { CardBrowser } from "@/components/card-browser";
import { listSongCards } from "@/lib/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cards"
};

export default function CardsPage() {
  return <CardBrowser cards={listSongCards().filter((card) => card.active)} />;
}
