import type { PlayerStatus } from "@/lib/types";

export type PausedVoiceSong = { songId: string };

function requestSignal(signal?: AbortSignal) {
  return signal
    ? AbortSignal.any([signal, AbortSignal.timeout(2000)])
    : AbortSignal.timeout(2000);
}

export async function pauseSpeakerForVoice(
  target: "local" | "owntone",
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch
): Promise<PausedVoiceSong | null> {
  if (target !== "owntone" || signal?.aborted) return null;
  try {
    const response = await fetcher("/api/player", {
      cache: "no-store",
      signal: requestSignal(signal)
    });
    if (!response.ok) return null;
    const status = (await response.json()) as PlayerStatus;
    if (!status.connected || status.state !== "play" || !status.song?.id)
      return null;
    const previous = { songId: status.song.id };
    // Pausing is only a courtesy to improve recognition. A speaker failure
    // must not be reported as a microphone failure or block voice requests.
    try {
      await fetcher("/api/player/action", {
        method: "POST",
        signal: requestSignal(signal),
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "pause" })
      });
    } catch {
      /* Resume later only if this same song actually became paused. */
    }
    return previous;
  } catch {
    return null;
  }
}

export async function resumeSpeakerAfterNoPlay(
  previous: PausedVoiceSong,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch
): Promise<boolean> {
  if (signal.aborted) return false;
  try {
    const response = await fetcher("/api/player", {
      cache: "no-store",
      signal: requestSignal(signal)
    });
    if (!response.ok) return false;
    const status = (await response.json()) as PlayerStatus;
    if (
      !status.connected ||
      status.state !== "pause" ||
      status.song?.id !== previous.songId
    )
      return false;
    const resumed = await fetcher("/api/player/action", {
      method: "POST",
      signal: requestSignal(signal),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "play" })
    });
    return resumed.ok;
  } catch {
    return false;
  }
}
