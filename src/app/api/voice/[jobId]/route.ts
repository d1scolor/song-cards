import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginAdminRequest } from "@/lib/auth";
import { cancelVoiceJob, findVoiceJob, publicVoiceJob } from "@/lib/voice-jobs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await context.params;
  const job = findVoiceJob(jobId);
  return job
    ? NextResponse.json(
        { job: publicVoiceJob(job) },
        { headers: { "Cache-Control": "no-store" } }
      )
    : NextResponse.json(
        { error: "Request expired. Please try again." },
        { status: 404 }
      );
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  if (!isSameOriginAdminRequest(request))
    return NextResponse.json(
      { error: "Same-origin request required." },
      { status: 403 }
    );
  const { jobId } = await context.params;
  await cancelVoiceJob(jobId);
  return new Response(null, { status: 204 });
}
