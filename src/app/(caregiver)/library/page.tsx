import type { Metadata } from "next";
import { SongLibrary } from "@/components/song-library";
import { listSongCards } from "@/lib/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Library"
};

export default function LibraryPage() {
  return (
    <main className="library-page">
      <SongLibrary
        songs={listSongCards().filter((song) => song.active)}
      />
    </main>
  );
}
