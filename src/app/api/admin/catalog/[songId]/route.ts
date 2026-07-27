import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { deleteSongCard } from "@/lib/repository";
import { triggerOwnToneScan } from "@/lib/playback";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ songId: string }> }
) {
  if (!isAdminRequest(request)) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }
  const { songId } = await context.params;
  if (!deleteSongCard(songId)) {
    return NextResponse.json({ error: "Song not found." }, { status: 404 });
  }
  triggerOwnToneScan().catch((error) => {
    console.error("Unable to trigger OwnTone scan", error);
  });
  return NextResponse.json({ ok: true });
}
