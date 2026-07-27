import fs from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/auth";
import { config } from "@/lib/config";
import { mediaDirectory } from "@/lib/db";
import {
  MediaValidationError,
  storeAudioBuffer,
  storeCoverBuffer
} from "@/lib/media";
import {
  createSongCard,
  listSongCards,
  nextMarkerId
} from "@/lib/repository";
import { triggerOwnToneScan } from "@/lib/playback";

const coverTypes = new Set([
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp"
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
  const coverValue = form.get("cover");
  const cover =
    coverValue instanceof File && coverValue.size > 0 ? coverValue : null;

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
  if (cover && cover.size > config.maxCoverBytes) {
    return NextResponse.json(
      { error: "The cover image is larger than the configured upload limit." },
      { status: 413 }
    );
  }
  if (cover && !coverTypes.has(cover.type)) {
    return NextResponse.json(
      { error: "Use a JPEG, PNG, WebP, or AVIF cover image." },
      { status: 415 }
    );
  }

  let storedAudio: Awaited<ReturnType<typeof storeAudioBuffer>> | null = null;
  let storedCover: Awaited<ReturnType<typeof storeCoverBuffer>> | null = null;
  try {
    storedAudio = await storeAudioBuffer(
      Buffer.from(await audio.arrayBuffer()),
      audio.name
    );
    if (cover) {
      storedCover = await storeCoverBuffer(
        Buffer.from(await cover.arrayBuffer())
      );
    }
  } catch (error) {
    if (storedCover) await fs.unlink(storedCover.target).catch(() => undefined);
    if (storedAudio) {
      await fs
        .unlink(path.join(mediaDirectory, storedAudio.filename))
        .catch(() => undefined);
    }
    return NextResponse.json(
      {
        error:
          error instanceof MediaValidationError
            ? error.message
            : "Unable to process the uploaded media."
      },
      { status: 415 }
    );
  }
  if (!storedAudio) {
    return NextResponse.json(
      { error: "Unable to process the uploaded audio." },
      { status: 500 }
    );
  }

  try {
    const card = createSongCard({
      ...parsed.data,
      filename: storedAudio.filename,
      originalName: audio.name,
      mimeType: storedAudio.mimeType,
      coverFilename: storedCover?.coverFilename ?? null
    });
    triggerOwnToneScan().catch((error) => {
      console.error("Unable to trigger OwnTone scan", error);
    });
    return NextResponse.json({ card }, { status: 201 });
  } catch (error) {
    await fs
      .unlink(path.join(mediaDirectory, storedAudio.filename))
      .catch(() => undefined);
    if (storedCover) await fs.unlink(storedCover.target).catch(() => undefined);
    const message =
      error instanceof Error && error.message.includes("UNIQUE")
        ? "That marker number is already assigned."
        : "Unable to save the song.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
