import assert from "node:assert/strict";
import { test } from "node:test";
import {
  runVoiceAgent,
  type AgentMessage,
  type VoiceCandidate
} from "@/lib/voice-agent";

const song: VoiceCandidate = {
  source: "library",
  songId: "pluto",
  title: "Pluto Song",
  artist: "KLT",
  durationMs: 109000
};
const call = (name: string, args: unknown) => ({
  content: null,
  tool_calls: [
    {
      id: crypto.randomUUID(),
      type: "function",
      function: { name, arguments: JSON.stringify(args) }
    }
  ]
});
const options = () => ({
  transcript: "Play the Pluto song",
  online: true,
  language: "English",
  signal: new AbortController().signal,
  searchLibrary: async () => [song],
  searchYoutube: async () => []
});
function selectedId(messages: AgentMessage[]) {
  return JSON.parse(messages.at(-1)!.content!).results[0].candidateId;
}

test("agent passes tool results back with matching call IDs and selects a returned candidate", async () => {
  let turns = 0;
  const result = await runVoiceAgent({
    ...options(),
    complete: async (messages) => {
      if (++turns === 1) return call("search_library", { query: "Pluto" });
      assert.equal(
        messages.at(-1)?.tool_call_id,
        messages.at(-2)?.tool_calls?.[0].id
      );
      assert.equal(
        JSON.parse(messages.at(-1)!.content!).results[0].title,
        "Pluto Song"
      );
      return call("play_result", { candidateId: selectedId(messages) });
    }
  });
  assert.deepEqual(result, { candidate: song });
  assert.equal(turns, 2);
});

test("agent can search YouTube after an empty local search", async () => {
  let turns = 0;
  const online: VoiceCandidate = {
    source: "youtube",
    videoId: "OOk1fNHrKCY",
    channelId: "UC7EFWpvc1wYuUwrtZ_BLi9A",
    title: "Pluto",
    artist: "KLT",
    durationMs: 109000
  };
  const result = await runVoiceAgent({
    ...options(),
    searchLibrary: async () => [],
    searchYoutube: async () => [online],
    complete: async (messages) =>
      ++turns === 1
        ? call("search_library", { query: "Pluto" })
        : turns === 2
          ? call("search_youtube", { query: "Pluto song" })
          : call("play_result", { candidateId: selectedId(messages) })
  });
  assert.deepEqual(result, { candidate: online });
});

test("agent refuses invented IDs, multiple tool calls, malformed arguments and unknown tools", async () => {
  for (const response of [
    call("play_result", { candidateId: "invented" }),
    call("shell", { query: "anything" }),
    {
      content: null,
      tool_calls: [
        ...call("search_library", { query: "Pluto" }).tool_calls,
        ...call("search_library", { query: "Pluto" }).tool_calls
      ]
    },
    {
      tool_calls: [
        {
          id: "x",
          type: "function",
          function: { name: "search_library", arguments: "not json" }
        }
      ]
    }
  ]) {
    let searches = 0;
    const result = await runVoiceAgent({
      ...options(),
      searchLibrary: async () => {
        searches++;
        return [song];
      },
      complete: async () => response
    });
    assert.ok("reason" in result);
    assert.equal(searches, 0);
  }
});

test("agent bounds model and search calls and offers only terminal tools on the last turn", async () => {
  let turns = 0;
  let searches = 0;
  const result = await runVoiceAgent({
    ...options(),
    searchLibrary: async () => {
      searches++;
      return [];
    },
    complete: async (_messages, tools) => {
      turns++;
      if (turns === 4)
        assert.deepEqual(
          tools.map((tool) => tool.function.name),
          ["finish_without_playing"]
        );
      return call("search_library", { query: "missing" });
    }
  });
  assert.ok("reason" in result);
  assert.equal(turns, 4);
  assert.equal(searches, 3);
});

test("online search must be enabled and follow a local search", async () => {
  for (const online of [false, true]) {
    let searches = 0;
    const result = await runVoiceAgent({
      ...options(),
      online,
      searchYoutube: async () => {
        searches++;
        return [];
      },
      complete: async (_messages, tools) => {
        assert.equal(
          tools.some((tool) => tool.function.name === "search_youtube"),
          online
        );
        return call("search_youtube", { query: "Pluto" });
      }
    });
    assert.ok("reason" in result);
    assert.equal(searches, 0);
  }
});

test("agent can explicitly decline and never acts on a response after cancellation", async () => {
  const result = await runVoiceAgent({
    ...options(),
    complete: async () =>
      call("finish_without_playing", { reason: "Which song would you like?" })
  });
  assert.deepEqual(result, { reason: "No matching song found." });
  const controller = new AbortController();
  let searches = 0;
  await assert.rejects(
    runVoiceAgent({
      ...options(),
      signal: controller.signal,
      searchLibrary: async () => {
        searches++;
        return [song];
      },
      complete: async () => {
        controller.abort();
        return call("search_library", { query: "Pluto" });
      }
    }),
    { name: "AbortError" }
  );
  assert.equal(searches, 0);
});

test("a full library snapshot allows direct selection in one model turn with saved custom prompts", async () => {
  let turns = 0;
  const result = await runVoiceAgent({
    ...options(),
    transcript: "Play the blue toe song",
    systemPrompt: "Prefer short songs.",
    libraryCandidates: [song],
    searchLibrary: async () => { throw new Error("Unnecessary library search"); },
    complete: async (messages, tools) => {
      turns++;
      assert.ok(messages[0].content!.includes("automatic speech-recognition transcript"));
      assert.ok(messages[0].content!.includes("pronunciation"));
      assert.ok(messages[0].content!.includes("Prefer short songs."));
      assert.equal(tools.some(tool => tool.function.name === "search_library"), false);
      const snapshot = messages.find(message => message.content?.startsWith('{"localLibrary":'))!;
      const library = JSON.parse(snapshot.content!).localLibrary;
      assert.equal(library[0].title, song.title);
      assert.equal(library[0].artist, song.artist);
      return call("play_result", { candidateId: library[0].candidateId });
    }
  });
  assert.deepEqual(result, { candidate: song });
  assert.equal(turns, 1);
});

test("provided library context permits online fallback without a redundant local search", async () => {
  for (const libraryCandidates of [[], [song]]) {
    let turns = 0;
    let searches = 0;
    const result = await runVoiceAgent({
      ...options(),
      libraryCandidates,
      searchYoutube: async () => { searches++; return []; },
      complete: async () => ++turns === 1
        ? call("search_youtube", { query: "Uranus song", scope: "preferred" })
        : call("finish_without_playing", { reason: "no_match" })
    });
    assert.equal(searches, 1);
    assert.ok("reason" in result);
  }
});

test("full-library mode still rejects invented playback IDs and unavailable search tools", async () => {
  for (const action of [call("play_result", { candidateId: "invented" }), call("search_library", { query: "Pluto" })]) {
    let searches = 0;
    const result = await runVoiceAgent({
      ...options(),
      libraryCandidates: [song],
      searchLibrary: async () => { searches++; return [song]; },
      complete: async () => action
    });
    assert.ok("reason" in result);
    assert.equal(searches, 0);
  }
});
