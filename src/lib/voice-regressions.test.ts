import assert from "node:assert/strict";
import { test } from "node:test";
import { rankSongMatches } from "@/lib/song-search";
import { releaseVoiceCapture } from "@/lib/voice-capture";
import { withDeadline } from "@/lib/async-deadline";
import {
  decodeJsonAction,
  jsonActionMessages,
  structuredActionFormat
} from "@/lib/voice-action-format";
import {
  agentTools,
  runVoiceAgent,
  type AgentMessage
} from "@/lib/voice-agent";
import {
  parseYoutubeResults,
  preferredChannelBatch
} from "@/lib/voice-youtube";

test("local matching ignores spoken filler, ranks topics, and tolerates misspellings", () => {
  const pluto = { title: "What Is Pluto? Closest Dwarf Planet", artist: "KLT" };
  const dinosaur = { title: "Dinosaur Song", artist: "KLT" };
  const songs = [
    { title: "A Very Happy Song", artist: "Someone" },
    dinosaur,
    pluto
  ];
  for (const query of [
    "a pluto song",
    "I would like to play a pluto song please",
    "Plutoo"
  ])
    assert.equal(rankSongMatches(songs, query)[0], pluto);
  assert.equal(rankSongMatches(songs, "a dinasaur song")[0], dinosaur);
  assert.deepEqual(rankSongMatches(songs, "a song please"), []);
});

test("schema output names only available actions and keeps tool history as JSON", () => {
  const tools = agentTools(true);
  const format = structuredActionFormat(tools);
  assert.equal(format.type, "json_schema");
  const action = decodeJsonAction({
    content: JSON.stringify({
      tool: "search_library",
      arguments: { query: "Pluto" }
    })
  }) as { tool_calls: { function: { name: string } }[] };
  assert.equal(action.tool_calls[0].function.name, "search_library");
  const history: AgentMessage[] = [
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "x",
          type: "function",
          function: { name: "search_library", arguments: '{"query":"Pluto"}' }
        }
      ]
    },
    { role: "tool", tool_call_id: "x", content: '{"results":[]}' }
  ];
  const encoded = jsonActionMessages(history);
  assert.equal(encoded[0].role, "assistant");
  assert.equal(JSON.parse(encoded[0].content!).tool, "search_library");
  assert.deepEqual(JSON.parse(encoded[1].content!).tool_result.results, []);
  assert.deepEqual(
    decodeJsonAction({ content: "Would you like something else?" }),
    { content: "Would you like something else?" }
  );
});

test("a prose-only response is repaired within the decision budget, with custom behavior preserved", async () => {
  let calls = 0;
  const result = await runVoiceAgent({
    transcript: "a pluto song",
    online: false,
    language: "English",
    systemPrompt: "Prefer related astronomy songs.",
    signal: new AbortController().signal,
    searchLibrary: async () => [
      {
        source: "library",
        songId: "dwarf",
        title: "Dwarf Planet Song",
        artist: "KLT",
        durationMs: 120000
      }
    ],
    searchYoutube: async () => [],
    complete: async (messages) => {
      assert.ok(
        messages[0].content?.includes("Prefer related astronomy songs.")
      );
      if (++calls === 1) return { content: "Would you like something else?" };
      const name = calls === 2 ? "search_library" : "play_result";
      const args =
        calls === 2
          ? { query: "dwarf planets" }
          : {
              candidateId: JSON.parse(messages.at(-1)!.content!).results[0]
                .candidateId
            };
      return {
        tool_calls: [
          {
            id: "x",
            type: "function",
            function: { name, arguments: JSON.stringify(args) }
          }
        ]
      };
    }
  });
  assert.ok("candidate" in result);
  assert.equal(calls, 3);
});

test("preferred search can fall back to all YouTube and only returned results can be selected", async () => {
  const scopes: string[] = [];
  let turns = 0;
  const result = await runVoiceAgent({
    transcript: "Pluto",
    online: true,
    language: "English",
    signal: new AbortController().signal,
    searchLibrary: async () => [],
    searchYoutube: async (_query, _signal, scope) => {
      scopes.push(scope);
      return scope === "all"
        ? [
            {
              source: "youtube",
              videoId: "OOk1fNHrKCY",
              channelId: "outside",
              title: "Pluto",
              artist: "Other",
              durationMs: 120000
            }
          ]
        : [];
    },
    complete: async (messages) => {
      turns++;
      const name =
        turns === 1
          ? "search_library"
          : turns < 4
            ? "search_youtube"
            : "play_result";
      const args =
        turns === 1
          ? { query: "Pluto" }
          : turns < 4
            ? { query: "Pluto", scope: turns === 2 ? "preferred" : "all" }
            : {
                candidateId: JSON.parse(messages.at(-1)!.content!).results[0]
                  .candidateId
              };
      return {
        tool_calls: [
          {
            id: "x",
            type: "function",
            function: { name, arguments: JSON.stringify(args) }
          }
        ]
      };
    }
  });
  assert.deepEqual(scopes, ["preferred", "all"]);
  assert.ok("candidate" in result);
  const settings = { preferredChannels: ["preferred"], maxSongSeconds: 600 };
  const body = {
    entries: [
      {
        id: "OOk1fNHrKCY",
        title: "Pluto",
        channel_id: "outside",
        duration: 120
      }
    ]
  };
  assert.equal(parseYoutubeResults(body, settings, "preferred").length, 0);
  assert.equal(parseYoutubeResults(body, settings, "all").length, 1);
  const channels = Array.from({ length: 50 }, (_, index) => String(index));
  const visited = new Set(
    Array.from({ length: 100 }, (_, index) =>
      preferredChannelBatch(channels, `topic ${index}`)
    ).flat()
  );
  assert.ok(visited.size > 3);
});

test("capture disposal stops microphone tracks once and never destroys the VAD twice", async () => {
  let stops = 0,
    destroys = 0,
    closes = 0;
  const capture = {
    stream: {
      getTracks: () => [
        {
          stop: () => {
            stops++;
          }
        }
      ]
    } as unknown as MediaStream,
    vad: {
      destroy: async () => {
        destroys++;
      }
    },
    context: {
      state: "running",
      close: async () => {
        closes++;
      }
    } as unknown as AudioContext
  };
  await Promise.all([
    releaseVoiceCapture(capture),
    releaseVoiceCapture(capture)
  ]);
  await releaseVoiceCapture(capture);
  assert.deepEqual([stops, destroys, closes], [1, 1, 1]);
  await assert.rejects(withDeadline(new Promise(() => {}), 5), {
    name: "TimeoutError"
  });
});
