import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "song-cards-owntone-pause-")
);
process.env.DATA_DIR = directory;
process.env.PLAYBACK_BACKEND = "owntone";
const { playerAction } = await import("@/lib/playback");
const original = globalThis.fetch;
after(() => {
  globalThis.fetch = original;
  fs.rmSync(directory, { recursive: true, force: true });
});

test("OwnTone pause is a no-op while stopped or already paused, even when the idle pause API would fail", async () => {
  for (const state of ["stop", "pause"]) {
    let pauses = 0;
    globalThis.fetch = async (url) => {
      const pathname = new URL(String(url)).pathname;
      if (pathname === "/api/player/pause") {
        pauses++;
        return new Response(null, { status: 500 });
      }
      return Response.json(
        pathname === "/api/player" ? { state, volume: 35 } : { items: [] }
      );
    };
    const result = await playerAction({ action: "pause" });
    assert.equal(result.state, state);
    assert.equal(pauses, 0);
  }
});

test("an actual pause failure remains an error for manual speaker controls", async () => {
  globalThis.fetch = async (url) => {
    const pathname = new URL(String(url)).pathname;
    if (pathname === "/api/player/pause")
      return new Response(null, { status: 500 });
    return Response.json(
      pathname === "/api/player" ? { state: "play", volume: 35 } : { items: [] }
    );
  };
  await assert.rejects(
    playerAction({ action: "pause" }),
    /OwnTone returned 500/
  );
});

const { playSong, waitForOwnToneSong } = await import("@/lib/playback");
const { createSong } = await import("@/lib/repository");
const { VoiceOperationError } = await import("@/lib/voice-errors");
const song = createSong({
  title: "Test song", artist: "Test artist", filename: "test-song.m4a",
  originalName: "test-song.m4a", mimeType: "audio/mp4", coverFilename: null,
  durationMs: 180000
});

type Fixture = {
  updating?: () => boolean;
  indexed?: () => boolean;
  state?: () => string;
  fail?: string;
  onStatus?: () => void;
};
function ownToneFixture(options: Fixture = {}) {
  const calls: string[] = [];
  let playing = false;
  globalThis.fetch = async (url) => {
    const pathname = new URL(String(url)).pathname;
    calls.push(pathname);
    if (pathname === options.fail) return new Response("private response", { status: 500 });
    if (pathname === "/api/library") return Response.json({ updating: options.updating?.() ?? false });
    if (pathname === "/api/library/files") return Response.json({ tracks: { items: options.indexed?.() === false ? [] : [{path: `/srv/media/${song.filename}`, uri: "library:track:24"}] } });
    if (pathname === "/api/queue/items/add") return Response.json({ count: 1 });
    if (pathname === "/api/player/play") playing = true;
    if (pathname === "/api/player") {
      options.onStatus?.();
      return Response.json({ state: options.state?.() ?? (playing ? "play" : "pause"), volume: 35 });
    }
    if (pathname === "/api/queue") return Response.json({items:[{path:`/srv/media/${song.filename}`,track_id:24}]});
    return new Response(null, { status: 204 });
  };
  return calls;
}
function clearMonitor() {
  clearInterval(globalThis.__songCardsEndMonitor);
  globalThis.__songCardsEndMonitor = undefined;
}

test("an indexed voice selection does not trigger a library rescan", async () => {
  const calls = ownToneFixture();
  await waitForOwnToneSong(song, new AbortController().signal);
  assert.equal(calls.includes("/api/update"), false);
});

test("new audio waits for the rescan to finish even when it appears in the file listing early", async () => {
  let statusReads = 0;
  let scans = 0;
  const calls = ownToneFixture({
    updating: () => { statusReads++; return scans > 0 && statusReads < 4; },
    indexed: () => scans > 0
  });
  const fixtureFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (new URL(String(url)).pathname === "/api/update") scans++;
    return fixtureFetch(url, init);
  };
  await waitForOwnToneSong(song, new AbortController().signal);
  assert.equal(scans, 1);
  assert.ok(statusReads >= 4);
  const scanIndex = calls.indexOf("/api/update");
  assert.ok(calls.slice(scanIndex + 1, -1).every(call => call === "/api/library"));
});

test("queue insertion waits for an active library scan and resumes a selected paused track once", async () => {
  let statusReads = 0;
  const calls = ownToneFixture({ updating: () => ++statusReads < 3 });
  try {
    const result = await playSong(song);
    assert.equal(result.state, "play");
    assert.equal(result.song?.id, song.id);
    assert.equal(calls.filter(call => call === "/api/player/play").length, 1);
    assert.equal(calls.filter(call => call === "/api/queue/items/add").length, 1);
    assert.ok(calls.indexOf("/api/queue/items/add") >= 3);
  } finally { clearMonitor(); }
});

test("transient paused status is allowed to settle without sending a redundant play command", async () => {
  let reads = 0;
  const calls = ownToneFixture({ state: () => ++reads > 1 ? "play" : "pause" });
  try {
    assert.equal((await playSong(song)).state, "play");
    assert.equal(calls.includes("/api/player/play"), false);
  } finally { clearMonitor(); }
});

test("a persistently paused player cannot be reported as successful playback", async () => {
  const calls = ownToneFixture({ state: () => "pause" });
  await assert.rejects(playSong(song), error => error instanceof VoiceOperationError && error.code === "speaker_not_playing");
  assert.equal(calls.filter(call => call === "/api/player/play").length, 1);
  assert.equal(calls.filter(call => call === "/api/queue/items/add").length, 1);
});

test("queue and status HTTP failures identify the command and never retry a queue mutation", async () => {
  for (const [path, operation] of [["/api/queue/items/add", "queue_add"], ["/api/player", "status"]]) {
    const calls = ownToneFixture({ fail: path });
    await assert.rejects(playSong(song), error => error instanceof VoiceOperationError && error.httpStatus === 500 && error.speakerOperation === operation && !error.message.includes("private response"));
    assert.equal(calls.filter(call => call === "/api/queue/items/add").length, 1);
  }
});

test("cancelling during scan waiting prevents queue insertion", async () => {
  const controller = new AbortController();
  const calls = ownToneFixture({ updating: () => { controller.abort(); return true; } });
  await assert.rejects(playSong(song, { signal: controller.signal }), {name:"AbortError"});
  assert.equal(calls.includes("/api/queue/items/add"), false);
});
