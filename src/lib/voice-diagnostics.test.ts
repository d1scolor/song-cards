import assert from "node:assert/strict";
import { test } from "node:test";
import { CommandError } from "@/lib/command";
import {
  voiceFailure,
  recordVoiceDiagnostic,
  recentVoiceDiagnostics
} from "@/lib/voice-diagnostics";
import {
  captureErrorCode,
  compatibleCaptureContext,
  safeCaptureErrorMessage
} from "@/lib/voice-capture-diagnostics";

test("voice failures classify media errors without retaining raw output or signed URLs", () => {
  const secret = "fixture-do-not-log";
  const cases = [
    [
      "ERROR: HTTP Error 403: Forbidden https://example.test/audio?token=" +
        secret,
      "youtube_forbidden"
    ],
    ["ERROR: Sign in to confirm you're not a bot", "youtube_auth_required"],
    ["ERROR: HTTP Error 429: Too Many Requests", "youtube_rate_limited"],
    ["ERROR: Requested format is not available", "youtube_format_unavailable"],
    ["Unable to start ffmpeg: ENOENT", "tool_missing"]
  ];
  const id = crypto.randomUUID();
  const lines: unknown[][] = [];
  const original = console.info;
  console.info = (...args) => {
    lines.push(args);
  };
  try {
    for (const [message, expected] of cases) {
      const error = voiceFailure(
        new CommandError(message, { stderr: message }),
        "download_failed"
      );
      assert.equal(error.code, expected);
      recordVoiceDiagnostic(id, "download", "failed", {
        code: error.code,
        speakerOperation: "queue_add",
        ...({ rawMessage: message, apiKey: secret } as object)
      });
    }
    const output = JSON.stringify([lines, recentVoiceDiagnostics()]);
    assert.equal(output.includes(secret), false);
    assert.equal(output.includes("https://"), false);
    assert.equal(output.includes(id), false);
    assert.ok(output.includes("youtube_forbidden"));
    assert.ok(output.includes('"speakerOperation":"queue_add"'));
  } finally {
    console.info = original;
  }
});

test("capture failures keep phase and native error names while removing secrets from console text", () => {
  assert.equal(
    captureErrorCode("microphone", {
      name: "NotAllowedError",
      message: "Denied"
    }),
    "microphone_permission_denied"
  );
  assert.equal(
    captureErrorCode("vad_loading", new Error("Failed to initialize wasm")),
    "vad_loading_failed"
  );
  assert.equal(
    captureErrorCode(
      "audio_context",
      new Error(
        "Connecting AudioNodes with different sample-rate is not supported"
      )
    ),
    "sample_rate_mismatch"
  );
  const message = safeCaptureErrorMessage(
    new Error(
      "https://example.test/a?token=fixture-secret Authorization: Bearer fixture-secret token=fixture-secret"
    )
  );
  assert.equal(message.includes("fixture-secret"), false);
});

test("capture audio probes the microphone graph and retries the Firefox sample-rate mismatch at 48 kHz", async () => {
  const original = globalThis.MediaStreamAudioSourceNode;
  const attempted: number[] = [];
  let closed = 0;
  globalThis.MediaStreamAudioSourceNode = class {
    constructor(context: AudioContext) {
      attempted.push(context.sampleRate);
      if (context.sampleRate !== 48000)
        throw new DOMException("different sample-rate", "NotSupportedError");
    }
    disconnect() {}
  } as unknown as typeof MediaStreamAudioSourceNode;
  const context = (rate: number) =>
    ({
      sampleRate: rate,
      close: async () => {
        closed++;
      },
      resume: async () => {}
    }) as unknown as AudioContext;
  const stream = {
    getAudioTracks: () => [{ getSettings: () => ({}) }]
  } as unknown as MediaStream;
  try {
    const result = await compatibleCaptureContext(
      stream,
      context(44100),
      (options) => context(options.sampleRate!)
    );
    assert.equal(result.sampleRate, 48000);
    assert.deepEqual(attempted, [44100, 48000]);
    assert.equal(closed, 1);
  } finally {
    globalThis.MediaStreamAudioSourceNode = original;
  }
});
