import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/auth";
import {
  deleteSongCard,
  findSongById,
  updateSongPlayback
} from "@/lib/repository";
import { triggerOwnToneScan } from "@/lib/playback";

const playbackSchema = z.object({
  manualGainDb: z.number().min(-12).max(12).optional(),
  startMs: z.number().int().min(0).optional(),
  endMs: z.number().int().positive().nullable().optional()
});

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ songId: string }> }
) {
  if (!isAdminRequest(request)) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }
  const { songId } = await context.params;
  if (!deleteSongCard(songId)) {
    return NextResponse.json({ error: "Song not found." }, { status: 404 });
  }
  triggerOwnToneScan().catch((error) => {
    console.error("Unable to trigger OwnTone scan", error);
  });
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ songId: string }> }
) {
  if (!isAdminRequest(request)) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }
  const parsed = playbackSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid playback settings." },
      { status: 400 }
    );
  }
  const { songId } = await context.params;
  const current = findSongById(songId);
  if (!current) {
    return NextResponse.json({ error: "Song not found." }, { status: 404 });
  }
  const startMs = parsed.data.startMs ?? current.startMs;
  const endMs =
    parsed.data.endMs === undefined ? current.endMs : parsed.data.endMs;
  if (endMs !== null && endMs <= startMs) {
    return NextResponse.json(
      { error: "The ending point must be after the starting point." },
      { status: 400 }
    );
  }
  if (
    current.durationMs > 0 &&
    (startMs >= current.durationMs ||
      (endMs !== null && endMs > current.durationMs))
  ) {
    return NextResponse.json(
      { error: "Playback points must be within the song." },
      { status: 400 }
    );
  }
  return NextResponse.json({
    song: updateSongPlayback(songId, parsed.data)
  });
}
