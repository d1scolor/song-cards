import { runVoiceAgent } from "@/lib/voice-agent";
import { completeVoice, transcribeVoice } from "@/lib/voice-services";
import { getVoiceSettings } from "@/lib/voice-settings";
import { prepareVoiceYoutube, searchVoiceYoutube } from "@/lib/voice-youtube";
import {
  findSongById,
  getPlaybackSettings,
  searchVoiceSongs,
  touchVoiceCachedSong
} from "@/lib/repository";
import { waitForOwnToneSong } from "@/lib/playback";
import {
  startKioskPlayback,
  type KioskPlaybackResult
} from "@/lib/kiosk-playback";
import type { Song } from "@/lib/types";

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
};
declare global {
  var __songCardsVoiceJobs: Map<string, Job> | undefined;
}
const jobs = (globalThis.__songCardsVoiceJobs ??= new Map<string, Job>());
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
    ...(job.song ? { title: job.song.title } : {})
  };
}

export function findVoiceJob(id: string) {
  return jobs.get(id);
}

export async function cancelVoiceJob(id: string) {
  const job = jobs.get(id);
  if (!job || terminal.has(job.stage)) return;
  job.controller.abort();
  // Wait for an in-flight speaker command before allowing the next scan.
  await job.playback?.catch(() => undefined);
  stage(job, "cancelled", "Request cancelled.");
}

export async function cancelAllVoiceJobs() {
  await Promise.all([...jobs.keys()].map(cancelVoiceJob));
}

export function startVoiceJob(
  audio: File,
  currentSong?: { title: string; artist: string }
) {
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
    id: crypto.randomUUID(),
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
    try {
      const transcript = await transcribeVoice(audio, settings, signal);
      signal.throwIfAborted();
      if (!transcript) {
        stage(job, "declined", "I didn't hear a request. Please try again.");
        return;
      }
      stage(job, "deciding", "Finding a song for you…");
      const decision = await runVoiceAgent({
        transcript,
        online: settings.onlineEnabled,
        context: { currentSong, preferredChannels: settings.preferredChannels },
        language: settings.language,
        signal,
        complete: (messages, tools, requestSignal) =>
          completeVoice(settings, messages, tools, requestSignal),
        searchLibrary: async (query) =>
          searchVoiceSongs(query).map((song) => ({
            source: "library",
            songId: song.id,
            title: song.title,
            artist: song.artist,
            durationMs: song.durationMs
          })),
        searchYoutube: (query, requestSignal) =>
          searchVoiceYoutube(query, settings, requestSignal),
        onSearch: () => stage(job, "searching", "Searching for your song…")
      });
      signal.throwIfAborted();
      if ("reason" in decision) {
        stage(job, "declined", decision.reason);
        return;
      }
      stage(job, "preparing", "Getting your song ready…");
      const candidate = decision.candidate;
      const song =
        candidate.source === "library"
          ? findSongById(candidate.songId)
          : await prepareVoiceYoutube(candidate, settings, signal);
      signal.throwIfAborted();
      if (!song) throw new Error("The selected song is no longer available.");
      touchVoiceCachedSong(song.id);
      if (getPlaybackSettings().kioskPlaybackTarget === "owntone")
        await waitForOwnToneSong(song, signal);
      signal.throwIfAborted();
      job.song = song;
      // Playback is committed by a separate client request, never by a late model reply.
      stage(job, "ready", `${song.title} is ready.`);
    } catch {
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
    !job ||
    job.stage !== "ready" ||
    !job.song ||
    !getVoiceSettings().enabled
  ) {
    throw new Error("This voice request is no longer ready to play.");
  }
  job.controller.signal.throwIfAborted();
  stage(job, "starting", "Starting your song…");
  job.playback = startKioskPlayback(job.song, undefined, job.controller.signal);
  try {
    const result = await job.playback;
    job.controller.signal.throwIfAborted();
    stage(job, "complete", `${job.song.title} is playing!`);
    return result;
  } catch {
    if (!terminal.has(job.stage))
      stage(job, "error", "Playback could not be started. Please try again.");
    throw new Error("Playback could not be started. Please try again.");
  }
}
