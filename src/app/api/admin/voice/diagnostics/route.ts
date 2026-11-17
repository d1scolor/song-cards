import { NextResponse, type NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { recentVoiceDiagnostics } from "@/lib/voice-diagnostics";

export function GET(request: NextRequest) {
  if (!isAdminRequest(request))
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  return NextResponse.json(
    { requests: recentVoiceDiagnostics() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
