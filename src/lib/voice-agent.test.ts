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
    searchLibrary: async () => {
      throw new Error("Unnecessary library search");
    },
    complete: async (messages, tools) => {
      turns++;
      assert.ok(
        messages[0].content!.includes("automatic speech-recognition transcript")
      );
      assert.ok(messages[0].content!.includes("pronunciation"));
      assert.ok(messages[0].content!.includes("Prefer short songs."));
      assert.equal(
        tools.some((tool) => tool.function.name === "search_library"),
        false
      );
      const snapshot = messages.find((message) =>
        message.content?.startsWith('{"localLibrary":')
      )!;
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
      searchYoutube: async () => {
        searches++;
        return [];
      },
      complete: async () =>
        ++turns === 1
          ? call("search_youtube", { query: "Uranus song", scope: "preferred" })
          : call("finish_without_playing", { reason: "no_match" })
    });
    assert.equal(searches, 1);
    assert.ok("reason" in result);
  }
});

test("full-library mode still rejects invented playback IDs and unavailable search tools", async () => {
  for (const action of [
    call("play_result", { candidateId: "invented" }),
    call("search_library", { query: "Pluto" })
  ]) {
    let searches = 0;
    const result = await runVoiceAgent({
      ...options(),
      libraryCandidates: [song],
      searchLibrary: async () => {
        searches++;
        return [song];
      },
      complete: async () => action
    });
    assert.ok("reason" in result);
    assert.equal(searches, 0);
  }
});

const priorVideo: VoiceCandidate = {
  source: "youtube",
  videoId: "OOk1fNHrKCY",
  channelId: "channel",
  title: "Prior Pluto",
  artist: "Other artist",
  durationMs: 120000
};
const recentRequests = [
  {
    request: "private-prior-request-token",
    at: new Date().toISOString(),
    transcript: "Play a Pluto song",
    selected: priorVideo,
    outcome: "playing" as const
  }
];

test("a correction excludes both the prior YouTube result and its cached library copy", async () => {
  let turns = 0;
  let rejected = "";
  const cached = {
    source: "library" as const,
    songId: "cached",
    videoId: priorVideo.videoId,
    title: "Cached prior Pluto",
    artist: "Other artist",
    durationMs: 120000
  };
  const result = await runVoiceAgent({
    ...options(),
    transcript: "No, another Pluto song by KLT",
    context: { recentRequests },
    libraryCandidates: [cached, song],
    onRejectPrevious: (request) => {
      rejected = request;
    },
    complete: async (messages, tools) => {
      assert.equal(
        JSON.stringify(messages).includes("private-prior-request-token"),
        false
      );
      if (++turns === 1)
        return call("reject_previous", { reason: "wrong_artist" });
      const results = JSON.parse(messages.at(-1)!.content!).localResults;
      assert.equal(results.length, 1);
      assert.equal(results[0].title, song.title);
      assert.deepEqual(
        tools.find((tool) => tool.function.name === "play_result")!.function
          .parameters.properties.candidateId.enum,
        ["local-2"]
      );
      return call("play_result", { candidateId: "local-2" });
    }
  });
  assert.equal(rejected, recentRequests[0].request);
  assert.deepEqual(result, { candidate: song });
});

test("rejected video IDs are filtered from later online searches", async () => {
  let turns = 0;
  const replacement: VoiceCandidate = {
    ...priorVideo,
    videoId: "jpV5jeFlt_E",
    title: "New Pluto"
  };
  const result = await runVoiceAgent({
    ...options(),
    context: { recentRequests },
    libraryCandidates: [],
    searchYoutube: async () => [priorVideo, replacement],
    complete: async (messages) => {
      if (++turns === 1)
        return call("reject_previous", { reason: "different_song" });
      if (turns === 2)
        return call("search_youtube", {
          query: "Pluto song KLT",
          scope: "all"
        });
      const results = JSON.parse(messages.at(-1)!.content!).results;
      assert.equal(results.length, 1);
      assert.equal(results[0].title, "New Pluto");
      return call("play_result", { candidateId: results[0].candidateId });
    }
  });
  assert.deepEqual(result, { candidate: replacement });
});

test("replay and unrelated requests can still select a previously played song", async () => {
  const cached = {
    source: "library" as const,
    songId: "cached",
    videoId: priorVideo.videoId,
    title: priorVideo.title,
    artist: priorVideo.artist,
    durationMs: 120000
  };
  const result = await runVoiceAgent({
    ...options(),
    transcript: "Play that same one again",
    context: { recentRequests },
    libraryCandidates: [cached],
    onRejectPrevious: () => {
      throw new Error("Replay must not reject");
    },
    complete: async () => call("play_result", { candidateId: "local-1" })
  });
  assert.deepEqual(result, { candidate: cached });
});

test("optional details enrich an ambiguous result with artist and popularity metadata", async () => {
  let turns = 0;
  let inspected = 0;
  const result = await runVoiceAgent({
    ...options(),
    transcript: "Play the popular Pluto song by KLT",
    libraryCandidates: [],
    searchYoutube: async () => [
      { ...priorVideo, artist: "", channel: "KLT", viewCount: 12000 }
    ],
    inspectCandidate: async (candidate) => {
      inspected++;
      assert.equal(candidate.videoId, priorVideo.videoId);
      return {
        artist: "KLT",
        channel: "KLT",
        track: "Pluto",
        album: "Space Songs",
        viewCount: 15000
      };
    },
    complete: async (messages, tools) => {
      if (++turns === 1)
        return call("search_youtube", {
          query: "Pluto KLT",
          scope: "preferred"
        });
      const id = selectedId(messages);
      if (turns === 2) {
        assert.ok(
          tools.some((tool) => tool.function.name === "inspect_results")
        );
        return call("inspect_results", { candidateIds: [id] });
      }
      const details = JSON.parse(messages.at(-1)!.content!).results[0];
      assert.equal(details.artist, "KLT");
      assert.equal(details.channel, "KLT");
      assert.equal(details.album, "Space Songs");
      assert.equal(details.viewCount, 15000);
      assert.equal(details.metadataAvailable, true);
      return call("play_result", { candidateId: id });
    }
  });
  assert.equal(inspected, 1);
  assert.ok("candidate" in result);
});

test("unavailable metadata does not prevent selecting a reasonable candidate", async () => {
  let turns = 0;
  const result = await runVoiceAgent({
    ...options(),
    libraryCandidates: [],
    searchYoutube: async () => [priorVideo],
    inspectCandidate: async () => {
      throw new Error("Optional lookup unavailable");
    },
    complete: async (messages) => {
      if (++turns === 1)
        return call("search_youtube", { query: "Pluto", scope: "all" });
      if (turns === 2)
        return call("inspect_results", {
          candidateIds: [selectedId(messages)]
        });
      assert.equal(
        JSON.parse(messages.at(-1)!.content!).results[0].metadataAvailable,
        false
      );
      return call("play_result", { candidateId: selectedId(messages) });
    }
  });
  assert.deepEqual(result, { candidate: priorVideo });
});

test("metadata lookup refuses invented candidates and enforces a three-video budget", async () => {
  for (const invalid of [true, false]) {
    let turns = 0;
    let inspected = 0;
    const result = await runVoiceAgent({
      ...options(),
      libraryCandidates: [],
      searchYoutube: async () =>
        Array.from({ length: 4 }, (_, index) => ({
          ...priorVideo,
          videoId: `video00000${index}`
        })),
      inspectCandidate: async () => {
        inspected++;
        return { artist: "KLT" };
      },
      complete: async (messages, tools) => {
        if (++turns === 1)
          return call("search_youtube", { query: "Pluto", scope: "all" });
        if (turns === 2)
          return call("inspect_results", {
            candidateIds: invalid
              ? ["invented"]
              : JSON.parse(messages.at(-1)!.content!)
                  .results.slice(0, 3)
                  .map((item: { candidateId: string }) => item.candidateId)
          });
        assert.equal(
          tools.some((tool) => tool.function.name === "inspect_results"),
          false
        );
        return call("finish_without_playing", { reason: "no_match" });
      }
    });
    assert.ok("reason" in result);
    assert.equal(inspected, invalid ? 0 : 3);
  }
});

test("invalid prose cannot exceed the six model-turn budget", async () => {
  let calls = 0;
  await runVoiceAgent({
    ...options(),
    complete: async () => {
      calls++;
      return { content: "Please tell me more" };
    }
  });
  assert.equal(calls, 6);
});

test("inspection deduplicates IDs in code without unsupported JSON-schema uniqueness keywords", async () => {
  let turns = 0;
  let lookups = 0;
  const result = await runVoiceAgent({
    ...options(),
    libraryCandidates: [],
    searchYoutube: async () => [priorVideo],
    inspectCandidate: async () => {
      lookups++;
      return { artist: "KLT" };
    },
    complete: async (messages, tools) => {
      assert.equal(JSON.stringify(tools).includes("uniqueItems"), false);
      if (++turns === 1)
        return call("search_youtube", { query: "Pluto", scope: "all" });
      if (turns === 2)
        return call("inspect_results", {
          candidateIds: [selectedId(messages), selectedId(messages)]
        });
      return call("play_result", { candidateId: selectedId(messages) });
    }
  });
  assert.equal(lookups, 1);
  assert.ok("candidate" in result);
});

test("corrections target the current song even after a later failed selection or a card scan", async () => {
  for (const history of [
    [],
    [
      {
        ...recentRequests[0],
        selected: { ...priorVideo, videoId: "failed00001" },
        outcome: "failed" as const
      }
    ]
  ]) {
    let turns = 0;
    const result = await runVoiceAgent({
      ...options(),
      transcript: "Another one please",
      context: {
        currentSong: {
          id: "currently-playing",
          title: "Current song",
          artist: "Artist"
        },
        recentRequests: history
      },
      libraryCandidates: [
        {
          source: "library",
          songId: "currently-playing",
          title: "Current song",
          artist: "Artist",
          durationMs: 120000
        },
        song
      ],
      complete: async (messages) => {
        if (++turns === 1)
          return call("reject_previous", { reason: "different_song" });
        const choices = JSON.parse(messages.at(-1)!.content!).localResults;
        assert.equal(choices.length, 1);
        assert.equal(choices[0].title, song.title);
        return call("play_result", { candidateId: choices[0].candidateId });
      }
    });
    assert.deepEqual(result, { candidate: song });
  }
});

test("cancellation during metadata inspection prevents a later playback decision", async () => {
  const controller = new AbortController();
  let turns = 0;
  await assert.rejects(
    runVoiceAgent({
      ...options(),
      signal: controller.signal,
      libraryCandidates: [],
      searchYoutube: async () => [priorVideo],
      inspectCandidate: async () => {
        controller.abort();
        return { artist: "KLT" };
      },
      complete: async (messages) =>
        ++turns === 1
          ? call("search_youtube", { query: "Pluto", scope: "all" })
          : call("inspect_results", { candidateIds: [selectedId(messages)] })
    }),
    { name: "AbortError" }
  );
  assert.equal(turns, 2);
});
