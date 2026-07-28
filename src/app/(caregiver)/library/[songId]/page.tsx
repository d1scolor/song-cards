import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SongDetail } from "@/components/song-detail";
import { findSongCardById } from "@/lib/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Song"
};

export default async function SongPage({
  params
}: {
  params: Promise<{ songId: string }>;
}) {
  const { songId } = await params;
  const song = findSongCardById(songId);
  if (!song) notFound();

  return <SongDetail song={song} />;
}
