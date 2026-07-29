import { NextResponse } from "next/server";
import { z } from "zod";
import { createKioskMediaToken } from "@/lib/auth";
import { config } from "@/lib/config";
import { songCompensation } from "@/lib/loudness";
import { playSong, playerAction } from "@/lib/playback";
import {
  findSongByMarker,
  getPlaybackSettings
} from "@/lib/repository";

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

  const settings = getPlaybackSettings();
  const playbackTarget =
    parsed.data.playbackTarget === "owntone"
      ? "owntone"
      : settings.kioskPlaybackTarget;

  if (playbackTarget === "local") {
    const compensation = songCompensation(song, settings);
    const token = createKioskMediaToken(song.id);
    void playerAction({ action: "stop" }).catch(() => undefined);
    return NextResponse.json({
      song,
      playbackTarget,
      localPlayback: {
        id: song.id,
        title: song.title,
        artist: song.artist,
        coverUrl: song.coverUrl,
        mediaUrl: `/api/kiosk/media/${encodeURIComponent(song.id)}?token=${encodeURIComponent(token)}`,
        durationMs: song.durationMs,
        startMs: song.startMs,
        endMs: song.endMs,
        masterVolume: settings.masterVolume,
        maxVolume: config.maxVolume,
        curveDivisor: settings.curveDivisor,
        totalGainDb: compensation.totalGainDb,
        rememberVolume: false
      }
    });
  }

  try {
    const player = await playSong(song);
    return NextResponse.json({ song, player, playbackTarget });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Playback failed." },
      { status: 502 }
    );
  }
}
