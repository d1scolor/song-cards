import type { Metadata } from "next";
import { SongManager } from "@/components/song-manager";
import { listSongCards, nextMarkerId } from "@/lib/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Manage songs"
};

export default function AdminSongsPage() {
  return (
    <SongManager
      initialSongs={listSongCards()}
      initialNextMarker={nextMarkerId()}
    />
  );
}
