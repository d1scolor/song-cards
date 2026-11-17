import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginAdminRequest } from "@/lib/auth";
import { confirmVoicePlayback } from "@/lib/voice-jobs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  if (!isSameOriginAdminRequest(request))
    return new Response(null, { status: 403 });
  const { jobId } = await context.params;
  return confirmVoicePlayback(jobId)
    ? new Response(null, { status: 204 })
    : NextResponse.json(
        { error: "Playback was not committed." },
        { status: 409 }
      );
}
