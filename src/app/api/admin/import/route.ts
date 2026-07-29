import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/auth";
import {
  ImportBusyError,
  startYouTubeImport,
  YouTubeUrlError
} from "@/lib/ytdlp";

const importSchema = z.object({
  url: z.string().trim().min(1).max(2_000),
  markerId: z.number().int().min(0).max(249)
});

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }
  const parsed = importSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a supported media link and a valid marker number." },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(
      { job: startYouTubeImport(parsed.data) },
      { status: 202 }
    );
  } catch (error) {
    const expected =
      error instanceof ImportBusyError || error instanceof YouTubeUrlError;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to import." },
      { status: expected ? 409 : 500 }
    );
  }
}
