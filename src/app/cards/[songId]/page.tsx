import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardDetail } from "@/components/card-detail";
import { findSongCardById } from "@/lib/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Song card"
};

export default async function CardPage({
  params
}: {
  params: Promise<{ songId: string }>;
}) {
  const { songId } = await params;
  const card = findSongCardById(songId);
  if (!card) notFound();

  return <CardDetail card={card} />;
}
