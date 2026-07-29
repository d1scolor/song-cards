import type { Metadata } from "next";
import { AdminSongLibrary } from "@/components/admin-song-library";
import { listSongCards } from "@/lib/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Library"
};

export default function AdminLibraryPage() {
  return <AdminSongLibrary initialSongs={listSongCards()} />;
}
