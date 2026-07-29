import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/auth";
import {
  getPlaybackSettings,
  updatePlaybackSettings
} from "@/lib/repository";

const settingsSchema = z.object({
  loudnessCompensationEnabled: z.boolean(),
  integratedTargetLufs: z.number().min(-24).max(-8),
  shortTermTargetLufs: z.number().min(-20).max(-5),
  curveDivisor: z.number().min(30).max(120)
});

function unauthorized() {
  return NextResponse.json(
    { error: "Authentication required." },
    { status: 401 }
  );
}

export function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorized();
  return NextResponse.json({ settings: getPlaybackSettings() });
}

export async function PUT(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorized();
  const parsed = settingsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid loudness settings." },
      { status: 400 }
    );
  }
  return NextResponse.json({
    settings: updatePlaybackSettings(parsed.data)
  });
}
