import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { mediaDirectory } from "@/lib/db";
import { findSongById } from "@/lib/repository";

export async function streamSongAudio(request: Request, songId: string) {
  const song = findSongById(songId);
  if (!song) {
    return Response.json({ error: "Song not found." }, { status: 404 });
  }

  const filename = path.join(mediaDirectory, path.basename(song.filename));
  let size: number;
  try {
    size = (await fsPromises.stat(filename)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return Response.json({ error: "Audio file not found." }, { status: 404 });
    }
    throw error;
  }

  const range = request.headers.get("range");
  let start = 0;
  let end = size - 1;
  let status = 200;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` }
      });
    }
    if (match[1]) start = Number.parseInt(match[1], 10);
    if (match[2]) end = Number.parseInt(match[2], 10);
    if (!match[1] && match[2]) {
      const suffix = Number.parseInt(match[2], 10);
      start = Math.max(0, size - suffix);
      end = size - 1;
    }
    end = Math.min(end, size - 1);
    if (start < 0 || start > end || start >= size) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` }
      });
    }
    status = 206;
  }

  const length = end - start + 1;
  const stream = fs.createReadStream(filename, { start, end });
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status,
    headers: {
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "Content-Length": String(length),
      "Content-Type": song.mimeType || "application/octet-stream",
      ...(status === 206
        ? { "Content-Range": `bytes ${start}-${end}/${size}` }
        : {}),
      "X-Content-Type-Options": "nosniff"
    }
  });
}
