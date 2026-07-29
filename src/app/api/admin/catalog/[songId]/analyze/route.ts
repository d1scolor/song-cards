import path from "node:path";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { mediaDirectory } from "@/lib/db";
import { analyzeAudioLoudness } from "@/lib/loudness";
import { probeAudio } from "@/lib/media";
import {
  findSongById,
  saveSongAnalysis
} from "@/lib/repository";

export async function POST(
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
  const song = findSongById(songId);
  if (!song) {
    return NextResponse.json({ error: "Song not found." }, { status: 404 });
  }
  const filename = path.join(mediaDirectory, song.filename);
  try {
    const [analysis, probe] = await Promise.all([
      analyzeAudioLoudness(filename),
      probeAudio(filename)
    ]);
    return NextResponse.json({
      song: saveSongAnalysis(songId, {
        analysis,
        durationMs: Math.round(probe.durationSeconds * 1_000)
      })
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Loudness analysis failed.";
    saveSongAnalysis(songId, { error: message });
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
