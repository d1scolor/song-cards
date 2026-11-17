import type { VoiceCandidate } from "@/lib/voice-agent";

export type VoiceTurn = {
  request: string;
  at: string;
  transcript: string;
  selected?: VoiceCandidate;
  outcome:
    | "processing"
    | "ready"
    | "playback_requested"
    | "playing"
    | "declined"
    | "failed"
    | "cancelled";
  rejected?: boolean;
};
const lifetime = 15 * 60_000;
declare global {
  var __songCardsVoiceSessions:
    Map<string, { updatedAt: number; turns: VoiceTurn[] }> | undefined;
}
const sessions = (globalThis.__songCardsVoiceSessions ??= new Map<
  string,
  { updatedAt: number; turns: VoiceTurn[] }
>());
function prune(now: number) {
  for (const [id, session] of sessions)
    if (now - session.updatedAt >= lifetime) sessions.delete(id);
  while (sessions.size > 100) sessions.delete(sessions.keys().next().value!);
}
export function voiceSessionHistory(
  id?: string,
  now = Date.now()
): VoiceTurn[] {
  prune(now);
  return id
    ? (sessions
        .get(id)
        ?.turns.map((turn) => ({
          ...turn,
          selected: turn.selected ? { ...turn.selected } : undefined
        })) ?? [])
    : [];
}
export function beginVoiceTurn(
  id: string | undefined,
  request: string,
  transcript: string,
  now = Date.now()
) {
  if (!id) return;
  prune(now);
  const turns = sessions.get(id)?.turns ?? [];
  turns.push({
    request,
    transcript: transcript.slice(0, 2000),
    at: new Date(now).toISOString(),
    outcome: "processing"
  });
  sessions.delete(id);
  sessions.set(id, { updatedAt: now, turns: turns.slice(-3) });
  prune(now);
}
export function updateVoiceTurn(
  id: string | undefined,
  request: string,
  change: Partial<Pick<VoiceTurn, "selected" | "outcome" | "rejected">>
) {
  if (!id) return;
  const session = sessions.get(id);
  if (!session || Date.now() - session.updatedAt >= lifetime) return;
  const turn = session.turns.find((turn) => turn.request === request);
  if (turn) Object.assign(turn, change);
}
export function voiceCandidateKey(candidate: VoiceCandidate): string {
  return candidate.videoId
    ? `youtube:${candidate.videoId}`
    : candidate.source === "library"
      ? `library:${candidate.songId}`
      : "";
}
