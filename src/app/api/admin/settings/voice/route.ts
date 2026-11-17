import { NextResponse, type NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import {
  publicVoiceSettings,
  saveVoiceSettings,
  voiceSettingsSchema
} from "@/lib/voice-settings";
import { cancelAllVoiceJobs } from "@/lib/voice-jobs";
import { voiceCacheCount } from "@/lib/repository";

export function GET(request: NextRequest) {
  if (!isAdminRequest(request))
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  return NextResponse.json(
    { settings: publicVoiceSettings(), cacheCount: voiceCacheCount() },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function PUT(request: NextRequest) {
  if (!isAdminRequest(request))
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  const parsed = voiceSettingsSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success)
    return NextResponse.json(
      {
        error:
          "Check service endpoints, model names, selection prompt, response format, and the list of up to 50 channel IDs."
      },
      { status: 400 }
    );
  const settings = saveVoiceSettings(parsed.data);
  await cancelAllVoiceJobs();
  return NextResponse.json(
    { settings, cacheCount: voiceCacheCount() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
