"use client";

import { Mic, RefreshCw, Square } from "lucide-react";
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
    currentSong?: { title: string; artist: string };
  }
>(function VoiceRequest(
  { disabled, beforeStart, onNoPlay, onBusy, onMessage, onPlayed, currentSong },
  ref
) {
  const active = useRef<Session | null>(null);
  const cancelling = useRef<Promise<void> | null>(null);
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
  useEffect(() => {
    callbacks.current = { beforeStart, onNoPlay, onBusy, onMessage, onPlayed };
  });

  async function releaseMicrophone(session: Session) {
    session.timers.forEach(clearTimeout);
    session.timers = [];
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
      session.jobId = crypto.randomUUID();
      form.set("requestId", session.jobId);
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

  async function start() {
    if (active.current || cancelling.current || disabled) return;
    const session: Session = {
      controller: new AbortController(),
      timers: [],
      submitted: false
    };
    active.current = session;
    setPhase("opening");
    callbacks.current.onBusy(true);
    callbacks.current.onMessage("Opening the microphone…");
    try {
      // Resume a context during the tap for browsers that require user activation.
      session.context = new AudioContext();
      const resumed = session.context.resume();
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
        openingStream,
        resumed,
        callbacks.current.beforeStart(session.controller.signal)
      ]);
      const [stream] = await withDeadline(
        opening,
        10000,
        session.controller.signal,
        "Microphone setup timed out."
      );
      const { MicVAD } = await import("@ricky0123/vad-web/dist/real-time-vad");
      if (active.current !== session) return;
      let heardSpeech = false;
      const vad = await MicVAD.new({
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
        ortConfig: (ort) => {
          ort.env.wasm.numThreads = 1;
        },
        onSpeechRealStart: () => {
          heardSpeech = true;
        },
        onSpeechEnd: (samples) => {
          void submit(session, samples);
        }
      });
      session.vad = vad;
      if (active.current !== session) {
        await releaseMicrophone(session);
        return;
      }
      await withDeadline(
        vad.start(),
        10000,
        session.controller.signal,
        "Microphone setup timed out."
      );
      if (active.current !== session) {
        await releaseMicrophone(session);
        return;
      }
      setPhase("listening");
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
      await fail(
        session,
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow the microphone and try again."
          : error instanceof DOMException && error.name === "NotReadableError"
            ? "The microphone is busy. Close other apps using it and try again."
            : "Voice setup failed. Tap the microphone to retry."
      );
    }
  }

  return (
    <button
      className={`voice-button ${phase !== "idle" ? "voice-button--active" : ""}`}
      type="button"
      disabled={disabled && phase === "idle"}
      onClick={() => {
        if (phase === "idle") void start();
        else
          void cancel().then(() =>
            callbacks.current.onMessage("Request cancelled.")
          );
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
          ? "Listening… · Cancel"
          : "Cancel request"}
    </button>
  );
});
