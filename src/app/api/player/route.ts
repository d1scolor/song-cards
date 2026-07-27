import { NextResponse } from "next/server";
import { getPlayerStatus } from "@/lib/playback";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getPlayerStatus());
}
