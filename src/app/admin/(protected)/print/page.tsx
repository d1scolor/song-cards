import type { Metadata } from "next";
import { PrintBuilder } from "@/components/print-builder";
import { listSongCards } from "@/lib/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Print cards"
};

export default function PrintPage() {
  return <PrintBuilder cards={listSongCards()} />;
}
