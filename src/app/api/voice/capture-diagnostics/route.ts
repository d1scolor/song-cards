import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameOriginAdminRequest } from "@/lib/auth";
import { getVoiceSettings } from "@/lib/voice-settings";
import { recordVoiceDiagnostic } from "@/lib/voice-diagnostics";

const schema = z
  .object({
    requestId: z.string().uuid(),
    event: z.enum(["start", "complete", "failed"]),
    capturePhase: z.enum([
      "microphone",
      "audio_context",
      "vad_loading",
      "vad_start"
    ]),
    code: z
      .enum([
        "microphone_permission_denied",
        "microphone_busy",
        "microphone_missing",
        "capture_timeout",
        "sample_rate_mismatch",
        "audio_context_failed",
        "vad_loading_failed",
        "vad_start_failed"
      ])
      .optional(),
    errorName: z
      .enum([
        "Error",
        "TypeError",
        "NotAllowedError",
        "NotReadableError",
        "NotFoundError",
        "SecurityError",
        "NotSupportedError",
        "InvalidStateError",
        "AbortError",
        "TimeoutError",
        "OperationError"
      ])
      .optional(),
    contextSampleRate: z.number().int().min(3000).max(768000).optional(),
    microphoneSampleRate: z.number().int().min(3000).max(768000).optional()
  })
  .strict();

export async function POST(request: NextRequest) {
  if (!isSameOriginAdminRequest(request) || !getVoiceSettings().enabled)
    return new Response(null, { status: 403 });
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      chunks.push(value);
    }
    const parsed = schema.safeParse(
      JSON.parse(Buffer.concat(chunks).toString("utf8"))
    );
    if (!parsed.success) return new Response(null, { status: 400 });
    const { requestId, event, ...details } = parsed.data;
    recordVoiceDiagnostic(requestId, "capture", event, details);
    return new Response(null, { status: 204 });
  } catch {
    return NextResponse.json(
      { error: "Invalid capture diagnostic." },
      { status: 400 }
    );
  } finally {
    reader.releaseLock();
  }
}
