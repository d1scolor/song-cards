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
