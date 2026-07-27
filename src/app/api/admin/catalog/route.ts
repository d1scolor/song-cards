import fs from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/auth";
import { config } from "@/lib/config";
import { mediaDirectory } from "@/lib/db";
import {
  createSongCard,
  listSongCards,
  nextMarkerId
} from "@/lib/repository";
import { triggerOwnToneScan } from "@/lib/playback";

const audioTypes = new Set([
  "audio/aac",
  "audio/flac",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/x-flac",
  "audio/x-m4a",
  "audio/x-wav"
]);

const fieldsSchema = z.object({
  title: z.string().trim().min(1).max(120),
  artist: z.string().trim().max(120),
  markerId: z.coerce.number().int().min(0).max(249)
});

function unauthorized() {
  return NextResponse.json({ error: "Authentication required." }, { status: 401 });
}

export function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorized();
  return NextResponse.json({
    cards: listSongCards(),
    nextMarkerId: nextMarkerId()
  });
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorized();

  const form = await request.formData();
  const parsed = fieldsSchema.safeParse({
    title: form.get("title"),
    artist: form.get("artist") ?? "",
    markerId: form.get("markerId")
  });
  const audio = form.get("audio");

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a title and a valid unused marker number." },
      { status: 400 }
    );
  }
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "Choose an audio file." }, { status: 400 });
  }
  if (audio.size > config.maxUploadBytes) {
    return NextResponse.json(
      { error: "The audio file is larger than the configured upload limit." },
      { status: 413 }
    );
  }
  if (!audioTypes.has(audio.type)) {
    return NextResponse.json(
      { error: `Unsupported audio type: ${audio.type || "unknown"}.` },
      { status: 415 }
    );
  }

  const extension = path.extname(audio.name).toLowerCase().slice(0, 10);
  const filename = `${crypto.randomUUID()}${extension}`;
  const target = path.join(mediaDirectory, filename);
  await fs.writeFile(target, Buffer.from(await audio.arrayBuffer()), {
    flag: "wx",
    mode: 0o640
  });

  try {
    const card = createSongCard({
      ...parsed.data,
      filename,
      originalName: audio.name,
      mimeType: audio.type
    });
    triggerOwnToneScan().catch((error) => {
      console.error("Unable to trigger OwnTone scan", error);
    });
    return NextResponse.json({ card }, { status: 201 });
  } catch (error) {
    await fs.unlink(target).catch(() => undefined);
    const message =
      error instanceof Error && error.message.includes("UNIQUE")
        ? "That marker number is already assigned."
        : "Unable to save the song.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
