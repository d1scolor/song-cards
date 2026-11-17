import assert from "node:assert/strict";
import { test } from "node:test";
import {
  pauseSpeakerForVoice,
  resumeSpeakerAfterNoPlay
} from "@/lib/voice-playback";

const status = (state: string, id = "previous") =>
  Response.json({ connected: true, state, song: { id } });

test("local voice capture never calls the external player", async () => {
  let requests = 0;
  const result = await pauseSpeakerForVoice("local", undefined, async () => {
    requests++;
    throw new Error();
  });
  assert.equal(result, null);
  assert.equal(requests, 0);
});

test("an idle or already-paused speaker is not paused or scheduled for resumption", async () => {
  for (const state of ["stop", "pause"]) {
    const requests: string[] = [];
    const result = await pauseSpeakerForVoice(
      "owntone",
      undefined,
      async (url) => {
        requests.push(String(url));
        return status(state);
      }
    );
    assert.equal(result, null);
    assert.deepEqual(requests, ["/api/player"]);
  }
});

test("a failed speaker pause or unreachable speaker cannot block recording", async () => {
  const requests: string[] = [];
  const result = await pauseSpeakerForVoice(
    "owntone",
    undefined,
    async (url) => {
      requests.push(String(url));
      return String(url) === "/api/player"
        ? status("play")
        : Response.json(
            { error: "OwnTone returned 500 for /api/player/pause." },
            { status: 502 }
          );
    }
  );
  assert.deepEqual(result, { songId: "previous" });
  assert.equal(requests.length, 2);
  assert.equal(
    await pauseSpeakerForVoice("owntone", undefined, async () => {
      throw new Error("Offline");
    }),
    null
  );
});

test("no-play resumption only resumes the same song that had been playing", async () => {
  for (const [state, id, expected] of [
    ["pause", "previous", true],
    ["pause", "another", false],
    ["stop", "previous", false],
    ["play", "previous", false]
  ] as const) {
    let playCalls = 0;
    const resumed = await resumeSpeakerAfterNoPlay(
      { songId: "previous" },
      new AbortController().signal,
      async (url, options) => {
        if (String(url) === "/api/player") return status(state, id);
        assert.deepEqual(JSON.parse(options!.body as string), {
          action: "play"
        });
        playCalls++;
        return status("play");
      }
    );
    assert.equal(resumed, expected);
    assert.equal(playCalls, expected ? 1 : 0);
  }
});

test("cancelled requests and speaker resume failures never start playback or fail voice setup", async () => {
  const controller = new AbortController();
  controller.abort();
  let requests = 0;
  assert.equal(
    await resumeSpeakerAfterNoPlay(
      { songId: "previous" },
      controller.signal,
      async () => {
        requests++;
        throw new Error();
      }
    ),
    false
  );
  assert.equal(requests, 0);
  assert.equal(
    await resumeSpeakerAfterNoPlay(
      { songId: "previous" },
      new AbortController().signal,
      async () => {
        throw new Error("Offline");
      }
    ),
    false
  );
});
