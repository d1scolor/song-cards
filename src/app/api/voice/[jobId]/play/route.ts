import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginAdminRequest } from "@/lib/auth";
import { playVoiceJob } from "@/lib/voice-jobs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  if (!isSameOriginAdminRequest(request))
    return NextResponse.json(
      { error: "Same-origin request required." },
      { status: 403 }
    );
  const { jobId } = await context.params;
  try {
    return NextResponse.json(await playVoiceJob(jobId), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch {
    return NextResponse.json(
      { error: "This song could not be started. Please try again." },
      { status: 409 }
    );
  }
}
