import assert from "node:assert/strict";
import { test } from "node:test";
import {
  beginVoiceTurn,
  updateVoiceTurn,
  voiceSessionHistory,
  voiceCandidateKey
} from "@/lib/voice-session";

test("voice conversations isolate kiosk sessions, retain three turns, and expire after inactivity", () => {
  const id = crypto.randomUUID();
  const other = crypto.randomUUID();
  const now = Date.now();
  for (let index = 0; index < 4; index++)
    beginVoiceTurn(id, String(index), `request ${index}`, now + index);
  assert.deepEqual(
    voiceSessionHistory(id, now + 4).map((turn) => turn.request),
    ["1", "2", "3"]
  );
  assert.deepEqual(voiceSessionHistory(other, now + 4), []);
  updateVoiceTurn(id, "3", { outcome: "playing", rejected: true });
  const history = voiceSessionHistory(id, now + 4);
  assert.equal(history.at(-1)?.outcome, "playing");
  assert.equal(history.at(-1)?.rejected, true);
  history[0].transcript = "modified outside session";
  assert.equal(voiceSessionHistory(id, now + 4)[0].transcript, "request 1");
  assert.deepEqual(voiceSessionHistory(id, now + 15 * 60_000 + 4), []);
});

test("cached copies of a YouTube video use the same rejection identity", () => {
  const details = { title: "Song", artist: "Artist", durationMs: 1000 };
  assert.equal(
    voiceCandidateKey({
      ...details,
      source: "library",
      songId: "cached",
      videoId: "video"
    }),
    voiceCandidateKey({
      ...details,
      source: "youtube",
      videoId: "video",
      channelId: "channel"
    })
  );
  assert.notEqual(
    voiceCandidateKey({ ...details, source: "library", songId: "another" }),
    voiceCandidateKey({
      ...details,
      source: "library",
      songId: "cached",
      videoId: "video"
    })
  );
});
