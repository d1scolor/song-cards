import { NextResponse } from "next/server";
import { z } from "zod";
import { playerAction } from "@/lib/playback";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["play", "pause", "stop"]) }),
  z.object({ action: z.literal("volume"), volume: z.number().min(0).max(100) }),
  z.object({
    action: z.literal("seek"),
    positionMs: z.number().int().min(0)
  })
]);

export async function POST(request: Request) {
  const parsed = actionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid playback action." },
      { status: 400 }
    );
  }
  try {
    return NextResponse.json(await playerAction(parsed.data));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Playback failed." },
      { status: 502 }
    );
  }
}
