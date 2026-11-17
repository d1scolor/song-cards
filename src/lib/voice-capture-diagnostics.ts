import type { VoiceErrorCode } from "@/lib/voice-errors";

export type CapturePhase =
  "microphone" | "audio_context" | "vad_loading" | "vad_start";
export function captureErrorName(error: unknown): string {
  return error &&
    typeof error === "object" &&
    "name" in error &&
    typeof error.name === "string"
    ? error.name
    : "Error";
}
function captureErrorText(error: unknown): string {
  if (typeof error === "string") return error;
  return error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
    ? error.message
    : "Unknown capture error";
}
export function captureErrorCode(
  phase: CapturePhase,
  error: unknown
): VoiceErrorCode {
  const name = captureErrorName(error);
  const message = captureErrorText(error);
  if (/sample.?rate|different rates/i.test(message))
    return "sample_rate_mismatch";
  if (name === "TimeoutError") return "capture_timeout";
  if (phase === "microphone") {
    if (name === "NotAllowedError" || name === "SecurityError")
      return "microphone_permission_denied";
    if (name === "NotReadableError") return "microphone_busy";
    if (name === "NotFoundError") return "microphone_missing";
  }
  return phase === "vad_loading"
    ? "vad_loading_failed"
    : phase === "vad_start"
      ? "vad_start_failed"
      : "audio_context_failed";
}

export function safeCaptureErrorMessage(error: unknown): string {
  return captureErrorText(error)
    .replace(/https?:\/\/[^\s'"\)]+/gi, "[URL]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(
      /((?:api[_-]?key|token|password|authorization)\s*[:=]\s*)[^\s,;]+/gi,
      "$1[redacted]"
    )
    .slice(0, 300);
}

// Probe before loading the model. Older Firefox builds cannot bridge a real
// microphone graph and AudioContext at different rates. Prefer a reported input
// rate, and retry at Firefox's usual 48 kHz graph rate only on that exact error.
export async function compatibleCaptureContext(
  stream: MediaStream,
  initial: AudioContext,
  create: (options: AudioContextOptions) => AudioContext = (options) =>
    new AudioContext(options)
) {
  let context = initial;
  const inputRate = stream.getAudioTracks()[0]?.getSettings().sampleRate;
  const replace = async (rate: number) => {
    await context.close().catch(() => undefined);
    context = create({ sampleRate: rate });
    await context.resume();
  };
  try {
    if (inputRate && inputRate !== context.sampleRate) await replace(inputRate);
    try {
      new MediaStreamAudioSourceNode(context, {
        mediaStream: stream
      }).disconnect();
    } catch (error) {
      if (
        captureErrorCode("audio_context", error) !== "sample_rate_mismatch" ||
        context.sampleRate === 48000
      )
        throw error;
      await replace(48000);
      new MediaStreamAudioSourceNode(context, {
        mediaStream: stream
      }).disconnect();
    }
    return context;
  } catch (error) {
    await context.close().catch(() => undefined);
    throw error;
  }
}
