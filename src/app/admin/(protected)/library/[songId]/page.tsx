import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminSongDetail } from "@/components/admin-song-detail";
import { config } from "@/lib/config";
import {
  findSongCardById,
  getPlaybackSettings
} from "@/lib/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Song"
};

export default async function AdminSongPage({
  params
}: {
  params: Promise<{ songId: string }>;
}) {
  const { songId } = await params;
  const song = findSongCardById(songId);
  if (!song) notFound();

  return (
    <AdminSongDetail
      initialSong={song}
      playbackSettings={getPlaybackSettings()}
      maxVolume={config.maxVolume}
    />
  );
}
