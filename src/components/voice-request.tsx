"use client";

import { Mic, RefreshCw, Square, X } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from "react";
import type { MicVAD } from "@ricky0123/vad-web/dist/real-time-vad";
import { encodeVoiceWav } from "@/lib/voice-audio";
import type { KioskPlaybackResult } from "@/lib/kiosk-playback";
import { releaseVoiceCapture } from "@/lib/voice-capture";
import { withDeadline, abortableDelay } from "@/lib/async-deadline";
import {
  captureErrorCode,
  captureErrorName,
  compatibleCaptureContext,
  safeCaptureErrorMessage,
  type CapturePhase
} from "@/lib/voice-capture-diagnostics";

export type VoiceRequestHandle = { cancel: () => Promise<void> };
type Session = {
  controller: AbortController;
  jobId?: string;
  vad?: MicVAD;
  context?: AudioContext;
  stream?: MediaStream;
  cleanup?: Promise<void>;
  timers: number[];
  submitted: boolean;
  frames: Float32Array[];
  sampleCount: number;
};

export const VoiceRequest = forwardRef<
  VoiceRequestHandle,
  {
    disabled: boolean;
    beforeStart: (signal: AbortSignal) => Promise<void>;
    onNoPlay: (signal: AbortSignal) => Promise<boolean>;
    onBusy: (busy: boolean) => void;
    onMessage: (message: string) => void;
    onPlayed: (
      result: KioskPlaybackResult,
      signal: AbortSignal
    ) => Promise<void>;
    currentSong?: { id?: string; title: string; artist: string };
  }
>(function VoiceRequest(
  { disabled, beforeStart, onNoPlay, onBusy, onMessage, onPlayed, currentSong },
  ref
) {
  const active = useRef<Session | null>(null);
  const cancelling = useRef<Promise<void> | null>(null);
  const conversation = useRef<string | undefined>(undefined);
  const callbacks = useRef({
    beforeStart,
    onNoPlay,
    onBusy,
    onMessage,
    onPlayed
  });
  const [phase, setPhase] = useState<
    "idle" | "opening" | "listening" | "working"
  >("idle");

  function captureDiagnostic(
    session: Session,
    capturePhase: CapturePhase,
    event: "start" | "complete" | "failed",
    error?: unknown
  ) {
    const knownNames = [
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
    ];
    const name = captureErrorName(error);
    const payload = {
      requestId: session.jobId,
      event,
      capturePhase,
      ...(error
        ? {
            code: captureErrorCode(capturePhase, error),
            errorName: knownNames.includes(name) ? name : "Error"
          }
        : {}),
      ...(session.context
        ? { contextSampleRate: session.context.sampleRate }
        : {}),
      ...(session.stream?.getAudioTracks()[0]?.getSettings().sampleRate
        ? {
            microphoneSampleRate: session.stream
              .getAudioTracks()[0]
              .getSettings().sampleRate
          }
        : {})
    };
    if (error)
      console.error(
        "[voice.capture]",
        { ...payload, requestId: session.jobId?.slice(0, 8) },
        safeCaptureErrorMessage(error)
      );
    void fetch("/api/voice/capture-diagnostics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
      signal: AbortSignal.timeout(3000)
    }).catch(() => undefined);
  }
  useEffect(() => {
    callbacks.current = { beforeStart, onNoPlay, onBusy, onMessage, onPlayed };
  });

  async function releaseMicrophone(session: Session) {
    session.timers.forEach(clearTimeout);
    session.timers = [];
    session.frames = [];
    session.sampleCount = 0;
    await releaseVoiceCapture(session);
  }

  async function cancel() {
    if (cancelling.current) return cancelling.current;
    const session = active.current;
    if (!session) return;
    active.current = null;
    session.controller.abort();
    cancelling.current = (async () => {
      const cancelServer = session.jobId
        ? fetch(`/api/voice/${session.jobId}`, {
            method: "DELETE",
            keepalive: true,
            signal: AbortSignal.timeout(5000)
          })
        : undefined;
      await releaseMicrophone(session);
      // Finish server cancellation before the parent starts another card scan.
      await cancelServer?.catch(() => undefined);
      setPhase("idle");
      callbacks.current.onBusy(false);
    })();
    try {
      await cancelling.current;
    } finally {
      cancelling.current = null;
    }
  }
  useImperativeHandle(ref, () => ({ cancel }));
  useEffect(() => {
    const cancelWhenHidden = () => {
      if (document.hidden) void cancel();
    };
    document.addEventListener("visibilitychange", cancelWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", cancelWhenHidden);
      void cancel();
    };
    // The session lives in refs so cancellation also works during unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fail(session: Session, message: string) {
    if (active.current !== session) return;
    await cancel();
    callbacks.current.onMessage(message);
  }

  async function submit(session: Session, samples: Float32Array) {
    if (active.current !== session || session.submitted) return;
    session.submitted = true;
    setPhase("working");
    callbacks.current.onMessage("Listening to your words…");
    await releaseMicrophone(session);
    if (active.current !== session) return;
    try {
      const form = new FormData();
      session.jobId ??= crypto.randomUUID();
      form.set("requestId", session.jobId);
      if (!conversation.current) {
        try {
          const stored = sessionStorage.getItem("song-cards-voice-session");
          conversation.current =
            stored && /^[a-f\d-]{36}$/i.test(stored)
              ? stored
              : crypto.randomUUID();
          sessionStorage.setItem(
            "song-cards-voice-session",
            conversation.current
          );
        } catch {
          conversation.current = crypto.randomUUID();
        }
      }
      form.set("sessionId", conversation.current);
      if (currentSong) form.set("currentSong", JSON.stringify(currentSong));
      form.set(
        "audio",
        new Blob([encodeVoiceWav(samples.subarray(0, 30 * 16000))], {
          type: "audio/wav"
        }),
        "request.wav"
      );
      // Do not abort the short creation request: if cancelled during upload, use
      // its returned ID to cancel server work rather than leave an orphan job.
      const created = await fetch("/api/voice", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(15_000)
      });
      const body = await created.json();
      if (!created.ok)
        throw new Error(body.error ?? "I couldn't hear that request.");
      session.jobId = body.job.id;
      if (active.current !== session) {
        await fetch(`/api/voice/${session.jobId}`, {
          method: "DELETE",
          keepalive: true,
          signal: AbortSignal.timeout(5000)
        });
        return;
      }
      const signal = session.controller.signal;
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline && active.current === session) {
        const response = await fetch(`/api/voice/${session.jobId}`, {
          cache: "no-store",
          signal: AbortSignal.any([signal, AbortSignal.timeout(10000)])
        });
        const status = await response.json();
        if (!response.ok) throw new Error(status.error ?? "Please try again.");
        if (active.current !== session) return;
        callbacks.current.onMessage(status.job.message);
        if (["ready", "complete"].includes(status.job.stage)) {
          const playing = await fetch(`/api/voice/${session.jobId}/play`, {
            method: "POST",
            signal: AbortSignal.any([signal, AbortSignal.timeout(15000)])
          });
          const result = await playing.json();
          if (!playing.ok)
            throw new Error(result.error ?? "Playback could not be started.");
          if (active.current !== session) return;
          await withDeadline(
            callbacks.current.onPlayed(result, signal),
            15000,
            signal,
            "The song is ready. Tap play in the player to start it."
          );
          if (active.current === session)
            await fetch(`/api/voice/${session.jobId}/played`, {
              method: "POST",
              signal: AbortSignal.any([signal, AbortSignal.timeout(3000)])
            }).catch(() => undefined);
          break;
        }
        if (status.job.stage === "declined") {
          const resumed = await withDeadline(
            callbacks.current.onNoPlay(signal),
            6000,
            signal
          ).catch(() => false);
          if (active.current === session && resumed)
            callbacks.current.onMessage(
              `${status.job.message} Resuming your song.`
            );
          break;
        }
        if (["cancelled", "error"].includes(status.job.stage)) break;
        await abortableDelay(500, signal);
      }
      if (active.current === session) await cancel();
    } catch (error) {
      if (active.current === session)
        await fail(
          session,
          error instanceof Error ? error.message : "Please try again."
        );
    }
  }

  function recognizeNow() {
    const session = active.current;
    if (!session || session.submitted || phase !== "listening") return;
    if (session.sampleCount < 1600) {
      void fail(session, "I didn't hear a request. Please try again.");
      return;
    }
    // Manual submission includes the recording even if VAD has not classified
    // a short word as speech yet. submit claims the session before cleanup, so
    // a simultaneous silence callback cannot upload the request twice.
    const samples = new Float32Array(session.sampleCount);
    let offset = 0;
    for (const frame of session.frames) {
      samples.set(frame, offset);
      offset += frame.length;
    }
    void submit(session, samples);
  }

  async function start() {
    if (active.current || cancelling.current || disabled) return;
    const session: Session = {
      controller: new AbortController(),
      jobId: crypto.randomUUID(),
      timers: [],
      submitted: false,
      frames: [],
      sampleCount: 0
    };
    active.current = session;
    setPhase("opening");
    callbacks.current.onBusy(true);
    callbacks.current.onMessage("Opening the microphone…");
    let capturePhase: CapturePhase = "microphone";
    let failedPhase: CapturePhase | undefined;
    const step = async <T,>(
      name: CapturePhase,
      work: Promise<T>,
      timeout: number
    ) => {
      capturePhase = name;
      try {
        return await withDeadline(work, timeout, session.controller.signal);
      } catch (error) {
        failedPhase = name;
        throw error;
      }
    };
    try {
      // Resume a context during the tap for browsers that require user activation.
      capturePhase = "audio_context";
      session.context = new AudioContext();
      const resumed = session.context.resume();
      capturePhase = "microphone";
      captureDiagnostic(session, "microphone", "start");
      const openingStream = navigator.mediaDevices
        .getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        })
        .then((stream) => {
          if (active.current !== session) {
            stream.getTracks().forEach((track) => track.stop());
            throw new DOMException("Cancelled", "AbortError");
          }
          session.stream = stream;
          return stream;
        });
      // Attach handlers immediately so a denied permission cannot become an
      // unhandled rejection while the speaker is being paused.
      const opening = Promise.all([
        step("microphone", openingStream, 30000),
        step("audio_context", resumed, 10000),
        callbacks.current.beforeStart(session.controller.signal)
      ]);
      const [stream] = await withDeadline(
        opening,
        30000,
        session.controller.signal,
        "Microphone setup timed out."
      );
      session.context = await step(
        "audio_context",
        compatibleCaptureContext(stream, session.context).then(
          async (context) => {
            if (active.current !== session) {
              await context.close().catch(() => undefined);
              throw new DOMException("Cancelled", "AbortError");
            }
            session.context = context;
            return context;
          }
        ),
        10000
      );
      const { MicVAD } = await step(
        "vad_loading",
        import("@ricky0123/vad-web/dist/real-time-vad"),
        15000
      );
      if (active.current !== session) return;
      let heardSpeech = false;
      const vad = await step(
        "vad_loading",
        MicVAD.new({
          model: "v5",
          startOnLoad: false,
          getStream: async () => stream,
          audioContext: session.context,
          baseAssetPath: "/voice/",
          onnxWASMBasePath: "/voice/",
          redemptionMs: 1400,
          minSpeechMs: 400,
          preSpeechPadMs: 500,
          submitUserSpeechOnPause: true,
          onFrameProcessed: (_probabilities, frame) => {
            if (active.current !== session || session.submitted) return;
            const remaining = 30 * 16000 - session.sampleCount;
            if (remaining <= 0) return;
            const copy = frame.slice(0, remaining);
            session.frames.push(copy);
            session.sampleCount += copy.length;
          },
          ortConfig: (ort) => {
            ort.env.wasm.numThreads = 1;
          },
          onSpeechRealStart: () => {
            heardSpeech = true;
          },
          onSpeechEnd: (samples) => {
            void submit(session, samples);
          }
        }).then(async (instance) => {
          if (active.current !== session) {
            await instance.destroy().catch(() => undefined);
            throw new DOMException("Cancelled", "AbortError");
          }
          session.vad = instance;
          return instance;
        }),
        15000
      );
      session.vad = vad;
      if (active.current !== session) {
        await releaseMicrophone(session);
        return;
      }
      await step("vad_start", vad.start(), 10000);
      if (active.current !== session) {
        await releaseMicrophone(session);
        return;
      }
      setPhase("listening");
      captureDiagnostic(session, "vad_start", "complete");
      callbacks.current.onMessage("Tell me which song you'd like.");
      session.timers.push(
        window.setTimeout(() => {
          if (!heardSpeech)
            void fail(
              session,
              "I didn't hear a request. Tap the microphone to try again."
            );
        }, 10_000)
      );
      session.timers.push(
        window.setTimeout(() => {
          if (heardSpeech)
            void withDeadline(vad.pause(), 2000)
              .then(() => {
                if (!session.submitted)
                  void fail(session, "Please try a shorter request.");
              })
              .catch(() => fail(session, "Please try a shorter request."));
          else void fail(session, "I didn't hear a request. Please try again.");
        }, 30_000)
      );
    } catch (error) {
      if (active.current !== session) return;
      capturePhase = failedPhase ?? capturePhase;
      captureDiagnostic(session, capturePhase, "failed", error);
      const code = captureErrorCode(capturePhase, error);
      await fail(
        session,
        code === "microphone_permission_denied"
          ? "Microphone access was blocked. Allow the microphone and try again."
          : code === "microphone_busy"
            ? "The microphone is busy. Close other apps using it and try again."
            : capturePhase === "vad_loading"
              ? "Voice detection couldn't load. See System → Recent voice activity."
              : capturePhase === "microphone"
                ? "The microphone couldn't open. See System → Recent voice activity."
                : "Voice audio setup failed. See System → Recent voice activity."
      );
    }
  }

  return (
    <div className="voice-controls">
      <button
        className={`voice-button ${phase !== "idle" ? "voice-button--active" : ""}`}
        type="button"
        disabled={
          (disabled && phase === "idle") ||
          phase === "opening" ||
          phase === "working"
        }
        onClick={() => {
          if (phase === "idle") void start();
          else if (phase === "listening") recognizeNow();
        }}
      >
        {phase === "idle" ? (
          <Mic size={26} aria-hidden="true" />
        ) : phase === "listening" ? (
          <Square size={24} aria-hidden="true" />
        ) : (
          <RefreshCw size={24} className="spin" aria-hidden="true" />
        )}
        {phase === "idle"
          ? "Ask for a song"
          : phase === "listening"
            ? "Tap again to recognize"
            : phase === "opening"
              ? "Opening microphone…"
              : "Recognizing…"}
      </button>
      {phase !== "idle" && (
        <button
          type="button"
          className="voice-cancel"
          aria-label="Cancel voice request"
          title="Cancel voice request"
          onClick={() => {
            void cancel().then(() =>
              callbacks.current.onMessage("Request cancelled.")
            );
          }}
        >
          <X size={22} aria-hidden="true" />
        </button>
      )}
    </div>
  );
});
