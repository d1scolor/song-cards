import { NextResponse } from "next/server";
import { z } from "zod";
import { playSong } from "@/lib/playback";
import { findSongByMarker } from "@/lib/repository";

const scanSchema = z.object({
  markerId: z.number().int().min(0).max(249)
});

export async function POST(request: Request) {
  const parsed = scanSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid marker." }, { status: 400 });
  }

  const song = findSongByMarker(parsed.data.markerId);
  if (!song) {
    return NextResponse.json(
      { error: `Card ${parsed.data.markerId} is not assigned to a song.` },
      { status: 404 }
    );
  }

  try {
    const player = await playSong(song);
    return NextResponse.json({ song, player });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Playback failed." },
      { status: 502 }
    );
  }
}
