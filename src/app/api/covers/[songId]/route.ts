import fs from "node:fs/promises";
import { findSongCover } from "@/lib/repository";

export async function GET(
  _request: Request,
  context: { params: Promise<{ songId: string }> }
) {
  const { songId } = await context.params;
  const filename = findSongCover(songId);
  if (!filename) {
    return Response.json({ error: "Cover not found." }, { status: 404 });
  }

  try {
    const image = await fs.readFile(filename);
    return new Response(image, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": "image/webp",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return Response.json({ error: "Cover not found." }, { status: 404 });
    }
    throw error;
  }
}
