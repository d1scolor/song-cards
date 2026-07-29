import type { NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { streamSongAudio } from "@/lib/audio-stream";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ songId: string }> }
) {
  if (!isAdminRequest(request)) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }
  const { songId } = await context.params;
  return streamSongAudio(request, songId);
}
