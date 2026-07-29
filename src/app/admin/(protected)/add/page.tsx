import type { Metadata } from "next";
import { SongManager } from "@/components/song-manager";
import { nextMarkerId } from "@/lib/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Add songs"
};

export default function AddSongsPage() {
  return <SongManager initialNextMarker={nextMarkerId()} />;
}
