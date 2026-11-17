import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginAdminRequest } from "@/lib/auth";
import { getVoiceSettings } from "@/lib/voice-settings";
import {
  startVoiceJob,
  publicVoiceJob,
  VoiceBusyError
} from "@/lib/voice-jobs";
import { maxVoiceUploadBytes, validateVoiceWav } from "@/lib/voice-audio";
import { z } from "zod";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSameOriginAdminRequest(request))
    return NextResponse.json(
      { error: "Same-origin request required." },
      { status: 403 }
    );
  if (!getVoiceSettings().enabled)
    return NextResponse.json(
      { error: "Voice requests are disabled." },
      { status: 404 }
    );
  // Enforce the bound while reading, including requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader)
    return NextResponse.json(
      { error: "A recording is required." },
      { status: 400 }
    );
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxVoiceUploadBytes + 10_000) {
        await reader.cancel();
        return NextResponse.json(
          { error: "The recording is too large." },
          { status: 413 }
        );
      }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks);
    const form = await new Response(body, {
      headers: { "content-type": request.headers.get("content-type") ?? "" }
    }).formData();
    const audio = form.get("audio");
    const requestId = form.get("requestId");
    if (requestId !== null && !z.string().uuid().safeParse(requestId).success)
      return NextResponse.json(
        { error: "Invalid request ID." },
        { status: 400 }
      );
    if (
      !(audio instanceof File) ||
      !validateVoiceWav(new Uint8Array(await audio.arrayBuffer()))
    ) {
      return NextResponse.json(
        { error: "Use a recording of up to 30 seconds." },
        { status: 400 }
      );
    }
    const context = form.get("currentSong");
    const parsedContext =
      typeof context === "string" && context.length <= 1000
        ? z
            .object({ title: z.string().max(120), artist: z.string().max(120) })
            .strict()
            .safeParse(JSON.parse(context))
        : undefined;
    return NextResponse.json(
      {
        job: publicVoiceJob(
          startVoiceJob(
            audio,
            parsedContext?.success ? parsedContext.data : undefined,
            typeof requestId === "string" ? requestId : undefined
          )
        )
      },
      { status: 202, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof VoiceBusyError
            ? error.message
            : "Unable to start the voice request."
      },
      { status: error instanceof VoiceBusyError ? 429 : 400 }
    );
  } finally {
    reader.releaseLock();
  }
}
