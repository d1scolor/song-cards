import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { getYouTubeImportJob } from "@/lib/ytdlp";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  if (!isAdminRequest(request)) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }
  const { jobId } = await context.params;
  const job = getYouTubeImportJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Import job not found." }, { status: 404 });
  }
  return NextResponse.json({ job });
}
