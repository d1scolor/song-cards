import { NextResponse } from "next/server";
import { generateMarkerSvg } from "@/lib/marker";

export async function GET(
  _request: Request,
  context: { params: Promise<{ markerId: string }> }
) {
  const { markerId } = await context.params;
  const id = Number.parseInt(markerId, 10);
  try {
    return new NextResponse(generateMarkerSvg(id), {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": "public, max-age=31536000, immutable"
      }
    });
  } catch {
    return NextResponse.json({ error: "Invalid marker." }, { status: 404 });
  }
}
