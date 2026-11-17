import { runVoiceAgent } from "@/lib/voice-agent";
import { completeVoice, transcribeVoice } from "@/lib/voice-services";
import { getVoiceSettings } from "@/lib/voice-settings";
import { prepareVoiceYoutube, searchVoiceYoutube } from "@/lib/voice-youtube";
import {
  findSongById,
  getPlaybackSettings,
  searchVoiceSongs,
  listVoiceSongs,
  voiceLibraryHints,
  touchVoiceCachedSong
} from "@/lib/repository";
import { waitForOwnToneSong } from "@/lib/playback";
import {
  startKioskPlayback,
  type KioskPlaybackResult
} from "@/lib/kiosk-playback";
import type { Song } from "@/lib/types";
import {
  recordVoiceDiagnostic,
  recordVoiceTranscript,
  voiceFailure,
  type VoiceDiagnosticPhase,
  type VoiceDiagnosticDetails
} from "@/lib/voice-diagnostics";
import type { VoiceErrorCode, SpeakerOperation } from "@/lib/voice-errors";

type Stage =
  | "transcribing"
  | "deciding"
  | "searching"
  | "preparing"
  | "ready"
  | "starting"
  | "complete"
  | "declined"
  | "error"
  | "cancelled";
type Job = {
  id: string;
  stage: Stage;
  message: string;
  createdAt: number;
  controller: AbortController;
  song?: Song;
  playback?: Promise<KioskPlaybackResult>;
  timings: { stage: Stage; durationMs: number }[];
  stageStartedAt: number;
  timer?: NodeJS.Timeout;
  diagnosticPhase?: VoiceDiagnosticPhase;
  failure?: {
    phase: VoiceDiagnosticPhase;
    code: VoiceErrorCode;
    httpStatus?: number;
    speakerOperation?: SpeakerOperation;
  };
};
declare global {
  var __songCardsVoiceJobs: Map<string, Job> | undefined;
  var __songCardsCancelledVoiceRequests: Map<string, number> | undefined;
}
const jobs = (globalThis.__songCardsVoiceJobs ??= new Map<string, Job>());
const cancelledRequests = (globalThis.__songCardsCancelledVoiceRequests ??=
  new Map<string, number>());
const terminal = new Set<Stage>(["complete", "declined", "error", "cancelled"]);

export class VoiceBusyError extends Error {}

function stage(job: Job, next: Stage, message: string) {
  job.timings.push({
    stage: job.stage,
    durationMs: Date.now() - job.stageStartedAt
  });
  job.stageStartedAt = Date.now();
  job.stage = next;
  job.message = message;
  if (terminal.has(next)) clearTimeout(job.timer);
}

export function publicVoiceJob(job: Job) {
  return {
    id: job.id,
    stage: job.stage,
    message: job.message,
    timings: job.timings,
    ...(job.failure ? { failure: job.failure } : {}),
    ...(job.song ? { title: job.song.title } : {})
  };
}

export function findVoiceJob(id: string) {
  return jobs.get(id);
}

export async function cancelVoiceJob(id: string) {
  const job = jobs.get(id);
  if (!job) {
    if (/^[a-f0-9-]{36}$/i.test(id)) {
      cancelledRequests.set(id, Date.now());
      while (cancelledRequests.size > 100)
        cancelledRequests.delete(cancelledRequests.keys().next().value!);
    }
    return;
  }
  if (terminal.has(job.stage)) return;
  job.controller.abort();
  // Wait for an in-flight speaker command before allowing the next scan.
  await job.playback?.catch(() => undefined);
  stage(job, "cancelled", "Request cancelled.");
  recordVoiceDiagnostic(
    job.id,
    job.diagnosticPhase ?? "selection",
    "cancelled"
  );
}

export async function cancelAllVoiceJobs() {
  await Promise.all([...jobs.keys()].map(cancelVoiceJob));
}

export function startVoiceJob(
  audio: File,
  currentSong?: { title: string; artist: string },
  requestId?: string
) {
  for (const [id, time] of cancelledRequests)
    if (Date.now() - time > 180000) cancelledRequests.delete(id);
  if (requestId && cancelledRequests.has(requestId))
    throw new Error("Request cancelled.");
  if (requestId && jobs.has(requestId)) return jobs.get(requestId)!;
  const settings = getVoiceSettings();
  if (!settings.enabled) throw new Error("Voice requests are disabled.");
  for (const [id, job] of jobs) {
    if (Date.now() - job.createdAt > 10 * 60_000) {
      job.controller.abort();
      clearTimeout(job.timer);
      jobs.delete(id);
    }
  }
  if ([...jobs.values()].some((job) => !terminal.has(job.stage))) {
    throw new VoiceBusyError(
      "Another voice request is in progress. Please try again shortly."
    );
  }
  // Keep only a small number of completed requests; no transcripts are stored.
  while (jobs.size >= 20) jobs.delete(jobs.keys().next().value!);
  const now = Date.now();
  const job: Job = {
    id: requestId ?? crypto.randomUUID(),
    stage: "transcribing",
    message: "Listening to your words…",
    createdAt: now,
    controller: new AbortController(),
    timings: [],
    stageStartedAt: now
  };
  jobs.set(job.id, job);
  job.timer = setTimeout(() => {
    void cancelVoiceJob(job.id);
  }, 180_000);
  job.timer.unref();
  void (async () => {
    const signal = job.controller.signal;
    let phase: VoiceDiagnosticPhase = "transcription";
    let phaseStartedAt = Date.now();
    const begin = (
      next: VoiceDiagnosticPhase,
      details: VoiceDiagnosticDetails = {}
    ) => {
      phase = next;
      job.diagnosticPhase = next;
      phaseStartedAt = Date.now();
      recordVoiceDiagnostic(job.id, phase, "start", details);
    };
    const complete = (details: VoiceDiagnosticDetails = {}) =>
      recordVoiceDiagnostic(job.id, phase, "complete", {
        durationMs: Date.now() - phaseStartedAt,
        ...details
      });
    try {
      begin("transcription");
      const transcript = await transcribeVoice(audio, settings, signal);
      signal.throwIfAborted();
      recordVoiceTranscript(job.id, transcript);
      complete();
      if (!transcript) {
        recordVoiceDiagnostic(job.id, "transcription", "declined");
        stage(job, "declined", "I didn't hear a request. Please try again.");
        return;
      }
      stage(job, "deciding", "Finding a song for you…");
      begin("library_context");
      const libraryCandidates = listVoiceSongs().map((song) => ({
        source: "library" as const,
        songId: song.id,
        title: song.title,
        artist: song.artist,
        durationMs: song.durationMs
      }));
      complete({ resultCount: libraryCandidates.length });
      const decision = await runVoiceAgent({
        transcript,
        online: settings.onlineEnabled,
        context: { currentSong, preferredChannels: settings.preferredChannels },
        language: settings.language,
        systemPrompt: settings.systemPrompt,
        libraryCandidates,
        signal,
        complete: async (messages, tools, requestSignal) => {
          begin("selection");
          const result = await completeVoice(
            settings,
            messages,
            tools,
            requestSignal
          );
          complete();
          return result;
        },
        searchLibrary: async (query) => {
          begin("library_search");
          const results = searchVoiceSongs(query).map((song) => ({
            source: "library" as const,
            songId: song.id,
            title: song.title,
            artist: song.artist,
            durationMs: song.durationMs
          }));
          complete({ resultCount: results.length });
          return results;
        },
        libraryHints: voiceLibraryHints,
        searchYoutube: async (query, requestSignal, scope) => {
          begin("youtube_search", { scope });
          const results = await searchVoiceYoutube(
            query,
            settings,
            requestSignal,
            scope
          );
          complete({ scope, resultCount: results.length });
          return results;
        },
        onInvalidAction: () =>
          recordVoiceDiagnostic(job.id, "selection", "invalid_action", {
            code: "invalid_model_action"
          }),
        onSearch: () => stage(job, "searching", "Searching for your song…"),
        onDecision: () => stage(job, "deciding", "Choosing a song…")
      });
      signal.throwIfAborted();
      if ("reason" in decision) {
        recordVoiceDiagnostic(job.id, "selection", "declined");
        stage(job, "declined", decision.reason);
        return;
      }
      stage(job, "preparing", "Getting your song ready…");
      const candidate = decision.candidate;
      recordVoiceDiagnostic(job.id, "selection", "complete", {
        source: candidate.source,
        ...(candidate.source === "youtube"
          ? { videoId: candidate.videoId }
          : {})
      });
      if (candidate.source === "youtube")
        begin("download", { videoId: candidate.videoId });
      const song =
        candidate.source === "library"
          ? findSongById(candidate.songId)
          : await prepareVoiceYoutube(candidate, settings, signal, (next) => {
              if (phase !== next) {
                complete();
                begin(next, { videoId: candidate.videoId });
              }
            });
      if (candidate.source === "youtube") complete();
      signal.throwIfAborted();
      if (!song) throw new Error("The selected song is no longer available.");
      touchVoiceCachedSong(song.id);
      if (getPlaybackSettings().kioskPlaybackTarget === "owntone") {
        begin("speaker_indexing");
        await waitForOwnToneSong(song, signal);
        complete();
      }
      signal.throwIfAborted();
      job.song = song;
      // Playback is committed by a separate client request, never by a late model reply.
      stage(job, "ready", `${song.title} is ready.`);
    } catch (error) {
      if (!signal.aborted) {
        const failure = voiceFailure(error);
        job.failure = {
          phase,
          code: failure.code,
          ...(failure.speakerOperation
            ? { speakerOperation: failure.speakerOperation }
            : {}),
          ...(failure.httpStatus ? { httpStatus: failure.httpStatus } : {})
        };
        recordVoiceDiagnostic(job.id, phase, "failed", job.failure);
      }
      if (!terminal.has(job.stage))
        stage(
          job,
          signal.aborted ? "cancelled" : "error",
          signal.aborted
            ? "Request cancelled."
            : "I couldn't prepare your song. Please try again."
        );
    }
  })();
  return job;
}

export async function playVoiceJob(id: string) {
  const job = jobs.get(id);
  if (
    job?.stage === "complete" &&
    job.playback &&
    !job.controller.signal.aborted
  )
    return job.playback;
  if (
    !job ||
    job.stage !== "ready" ||
    !job.song ||
    !getVoiceSettings().enabled
  ) {
    throw new Error("This voice request is no longer ready to play.");
  }
  job.controller.signal.throwIfAborted();
  stage(job, "starting", "Starting your song…");
  recordVoiceDiagnostic(job.id, "playback", "start");
  job.playback = startKioskPlayback(job.song, undefined, job.controller.signal);
  try {
    const result = await job.playback;
    job.controller.signal.throwIfAborted();
    stage(job, "complete", `${job.song.title} is playing!`);
    recordVoiceDiagnostic(
      job.id,
      "playback",
      "complete",
      "player" in result && result.player
        ? {
            playerState: result.player.state,
            connected: result.player.connected
          }
        : {}
    );
    return result;
  } catch (error) {
    if (!job.controller.signal.aborted) {
      const failure = voiceFailure(error);
      job.failure = {
        phase: "playback",
        code: failure.code,
        ...(failure.speakerOperation
          ? { speakerOperation: failure.speakerOperation }
          : {}),
        ...(failure.httpStatus ? { httpStatus: failure.httpStatus } : {})
      };
      recordVoiceDiagnostic(job.id, "playback", "failed", job.failure);
    }
    if (!terminal.has(job.stage))
      stage(job, "error", "Playback could not be started. Please try again.");
    throw new Error("Playback could not be started. Please try again.");
  }
}
