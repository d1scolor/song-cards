import { createKioskMediaToken } from "@/lib/auth";
import { config } from "@/lib/config";
import { songCompensation } from "@/lib/loudness";
import { playSong, playerAction } from "@/lib/playback";
import { getPlaybackSettings } from "@/lib/repository";
import type { Song } from "@/lib/types";

export async function startKioskPlayback(
  song: Song,
  target?: "local" | "owntone",
  signal?: AbortSignal
) {
  signal?.throwIfAborted();
  const settings = getPlaybackSettings();
  const playbackTarget = target ?? settings.kioskPlaybackTarget;
  if (playbackTarget === "owntone") {
    const player = await playSong(song, { signal });
    return { song, player, playbackTarget };
  }
  const compensation = songCompensation(song, settings);
  const token = createKioskMediaToken(song.id);
  void playerAction({ action: "stop" }).catch(() => undefined);
  return {
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
  };
}

export type KioskPlaybackResult = Awaited<
  ReturnType<typeof startKioskPlayback>
>;
