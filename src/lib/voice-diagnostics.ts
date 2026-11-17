import { CommandError } from "@/lib/command";
import {
  VoiceOperationError,
  voiceErrorDescriptions,
  type VoiceErrorCode
} from "@/lib/voice-errors";

export type VoiceDiagnosticPhase =
  | "capture"
  | "transcription"
  | "selection"
  | "library_search"
  | "youtube_search"
  | "download"
  | "audio_processing"
  | "speaker_indexing"
  | "playback";
export type VoiceDiagnosticDetails = {
  code?: VoiceErrorCode;
  httpStatus?: number;
  source?: "library" | "youtube";
  scope?: "preferred" | "all";
  resultCount?: number;
  videoId?: string;
  capturePhase?: "microphone" | "audio_context" | "vad_loading" | "vad_start";
  errorName?: string;
  contextSampleRate?: number;
  microphoneSampleRate?: number;
  durationMs?: number;
  playerState?: "play" | "pause" | "stop";
  connected?: boolean;
};
export type VoiceDiagnosticEvent = VoiceDiagnosticDetails & {
  at: string;
  phase: VoiceDiagnosticPhase;
  event:
    | "start"
    | "complete"
    | "failed"
    | "declined"
    | "invalid_action"
    | "cancelled";
};
export type VoiceDiagnosticRecord = {
  request: string;
  startedAt: string;
  events: VoiceDiagnosticEvent[];
};
declare global {
  var __songCardsVoiceDiagnostics:
    Map<string, VoiceDiagnosticRecord> | undefined;
}
const records = (globalThis.__songCardsVoiceDiagnostics ??= new Map<
  string,
  VoiceDiagnosticRecord
>());

export function recordVoiceDiagnostic(
  id: string,
  phase: VoiceDiagnosticPhase,
  event: VoiceDiagnosticEvent["event"],
  details: VoiceDiagnosticDetails = {}
) {
  let record = records.get(id);
  const now = new Date().toISOString();
  if (!record) {
    record = { request: id.slice(0, 8), startedAt: now, events: [] };
    records.set(id, record);
    while (records.size > 20) records.delete(records.keys().next().value!);
  }
  const safe: VoiceDiagnosticDetails = {};
  if (details.code && Object.hasOwn(voiceErrorDescriptions, details.code))
    safe.code = details.code;
  if (
    typeof details.httpStatus === "number" &&
    Number.isInteger(details.httpStatus) &&
    details.httpStatus >= 100 &&
    details.httpStatus <= 599
  )
    safe.httpStatus = details.httpStatus;
  if (details.source === "library" || details.source === "youtube")
    safe.source = details.source;
  if (details.scope === "preferred" || details.scope === "all")
    safe.scope = details.scope;
  if (details.videoId && /^[\w-]{11}$/.test(details.videoId))
    safe.videoId = details.videoId;
  if (
    details.capturePhase &&
    ["microphone", "audio_context", "vad_loading", "vad_start"].includes(
      details.capturePhase
    )
  )
    safe.capturePhase = details.capturePhase;
  if (
    details.errorName &&
    [
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
    ].includes(details.errorName)
  )
    safe.errorName = details.errorName;
  for (const key of [
    "contextSampleRate",
    "microphoneSampleRate",
    "resultCount",
    "durationMs"
  ] as const) {
    const value = details[key];
    if (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 10000000
    )
      safe[key] = value;
  }
  if (
    details.playerState &&
    ["play", "pause", "stop"].includes(details.playerState)
  )
    safe.playerState = details.playerState;
  if (typeof details.connected === "boolean")
    safe.connected = details.connected;
  const entry = { at: now, phase, event, ...safe };
  record.events.push(entry);
  if (record.events.length > 40) record.events.shift();
  // Only fields explicitly constructed by application code are accepted here.
  // Never log prompts, transcripts, request headers, raw exceptions or tool output.
  console.info(
    "[voice]",
    JSON.stringify({ request: record.request, ...entry })
  );
}

export function recentVoiceDiagnostics() {
  return [...records.values()].reverse();
}

export function voiceFailure(
  error: unknown,
  fallback: VoiceErrorCode = "operation_failed"
): VoiceOperationError {
  if (error instanceof VoiceOperationError) return error;
  if (error instanceof CommandError) {
    const text = (
      error.stderr +
      "\n" +
      error.stdout +
      "\n" +
      error.message
    ).toLowerCase();
    const code = /sign in|confirm.*bot|po.token|cookies.*required/.test(text)
      ? "youtube_auth_required"
      : /\b429\b/.test(text)
        ? "youtube_rate_limited"
        : /\b403\b/.test(text)
          ? "youtube_forbidden"
          : /requested format.*not available|no video formats/.test(text)
            ? "youtube_format_unavailable"
            : /video unavailable|private video|not available in your country/.test(
                  text
                )
              ? "youtube_unavailable"
              : /unable to start|not found|enoent/.test(text)
                ? "tool_missing"
                : /timed out|timeout/.test(text)
                  ? "timeout"
                  : fallback;
    return new VoiceOperationError(code);
  }
  if (error instanceof Error) {
    if (error.name === "TimeoutError")
      return new VoiceOperationError("timeout");
    if (error.name === "SyntaxError" || error.name === "ZodError")
      return new VoiceOperationError("invalid_response");
    if (error.name === "TypeError")
      return new VoiceOperationError("network_error");
  }
  return new VoiceOperationError(fallback);
}

export function describeVoiceDiagnostic(entry: VoiceDiagnosticEvent) {
  return entry.code ? voiceErrorDescriptions[entry.code] : "";
}
