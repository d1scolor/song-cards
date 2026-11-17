import { NextResponse } from "next/server";
import { z } from "zod";
import { startKioskPlayback } from "@/lib/kiosk-playback";
import { findSongByMarker } from "@/lib/repository";

const scanSchema = z.object({
  markerId: z.number().int().min(0).max(249),
  playbackTarget: z.enum(["configured", "owntone"]).default("configured")
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
    return NextResponse.json(
      await startKioskPlayback(
        song,
        parsed.data.playbackTarget === "owntone" ? "owntone" : undefined
      )
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Playback failed." },
      { status: 502 }
    );
  }
}
