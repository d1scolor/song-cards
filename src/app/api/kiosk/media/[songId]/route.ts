import type { NextRequest } from "next/server";
import { streamSongAudio } from "@/lib/audio-stream";
import { verifyKioskMediaToken } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ songId: string }> }
) {
  const { songId } = await context.params;
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!verifyKioskMediaToken(songId, token)) {
    return Response.json(
      { error: "This kiosk audio link is invalid or has expired." },
      { status: 401 }
    );
  }
  return streamSongAudio(request, songId);
}
