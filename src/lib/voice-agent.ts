import { z } from "zod";
import { modelVoiceMetadata, type VoiceMetadata } from "@/lib/voice-metadata";
import { voiceCandidateKey, type VoiceTurn } from "@/lib/voice-session";
import {
  defaultVoicePrompt,
  voiceProtocolPrompt,
  noPlayMessages
} from "@/lib/voice-prompt";

export type VoiceCandidate = VoiceMetadata & {
  title: string;
  artist: string;
  durationMs: number;
} & (
    | { source: "library"; songId: string; videoId?: string }
    | { source: "youtube"; videoId: string; channelId: string }
  );
export type AgentMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};
type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};
export type AgentDecision = { candidate: VoiceCandidate } | { reason: string };

export const voiceSystemPrompt = defaultVoicePrompt;

function tool(name: string, description: string, field: string) {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties: { [field]: { type: "string" } } as Record<
          string,
          {
            type: string;
            enum?: string[];
            items?: { type: string; enum?: string[] };
            minItems?: number;
            maxItems?: number;
          }
        >,
        required: [field],
        additionalProperties: false
      }
    }
  };
}

export function agentTools(online: boolean) {
  const tools = [
    tool(
      "search_library",
      "Search local songs by topic, title or artist.",
      "query"
    ),
    ...(online
      ? [
          tool(
            "search_youtube",
            'Search related songs. Use scope "preferred" first, or "all" to search outside preferred channels.',
            "query"
          )
        ]
      : []),
    tool(
      "play_result",
      "Select a song from the provided local library or this request's search results.",
      "candidateId"
    ),
    tool(
      "finish_without_playing",
      "Finish only when no reasonable related song exists or the request is not usable. Use a reason code, never prose or a question.",
      "reason"
    )
  ];
  const inspect = tool(
    "inspect_results",
    "Look up fuller metadata for up to three supplied candidates to distinguish artists or versions. Optional; missing metadata does not prevent playback.",
    "candidateIds"
  );
  inspect.function.parameters.properties.candidateIds = {
    type: "array",
    items: { type: "string" },
    minItems: 1,
    maxItems: 3
  };
  const reject = tool(
    "reject_previous",
    "For a correction or request for another song, reject the previous selection before choosing a different result. Do not use for unrelated requests or replay.",
    "reason"
  );
  reject.function.parameters.properties.reason.enum = [
    "different_song",
    "wrong_artist",
    "wrong_version"
  ];
  tools.unshift(reject);
  if (online) tools.unshift(inspect);
  const finish = tools.find(
    (item) => item.function.name === "finish_without_playing"
  )!;
  Object.assign(finish.function.parameters.properties.reason, {
    enum: Object.keys(noPlayMessages)
  });
  const youtube = tools.find((item) => item.function.name === "search_youtube");
  if (youtube) {
    Object.assign(youtube.function.parameters.properties, {
      scope: { type: "string", enum: ["preferred", "all"] }
    });
    youtube.function.parameters.required.push("scope");
  }
  return tools;
}

const messageSchema = z.object({
  content: z.string().nullable().optional(),
  tool_calls: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        type: z.literal("function"),
        function: z.object({
          name: z.string().max(80),
          arguments: z.string().max(4000)
        })
      })
    )
    .length(1)
});
const querySchema = z
  .object({ query: z.string().trim().min(1).max(200) })
  .strict();

export async function runVoiceAgent(input: {
  transcript: string;
  online: boolean;
  language: string;
  systemPrompt?: string;
  context?: {
    currentSong?: { id?: string; title: string; artist: string };
    preferredChannels?: string[];
    recentRequests?: VoiceTurn[];
  };
  signal: AbortSignal;
  complete: (
    messages: AgentMessage[],
    tools: ReturnType<typeof agentTools>,
    signal: AbortSignal
  ) => Promise<unknown>;
  searchLibrary: (query: string) => Promise<VoiceCandidate[]>;
  libraryHints?: () => string[];
  libraryCandidates?: Extract<VoiceCandidate, { source: "library" }>[];
  searchYoutube: (
    query: string,
    signal: AbortSignal,
    scope: "preferred" | "all"
  ) => Promise<VoiceCandidate[]>;
  onSearch?: () => void;
  onDecision?: () => void;
  onInvalidAction?: () => void;
  inspectCandidate?: (
    candidate: VoiceCandidate,
    signal: AbortSignal
  ) => Promise<VoiceMetadata | undefined>;
  onRejectPrevious?: (request: string) => void;
}): Promise<AgentDecision> {
  const candidates = new Map<string, VoiceCandidate>();
  const excluded = new Set<string>();
  const inspected = new Set<string>();
  let searchCount = 0;
  let rejectedPrevious = false;
  const recent = [...(input.context?.recentRequests ?? [])].reverse();
  const current = input.context?.currentSong;
  const currentCandidate = input.libraryCandidates?.find((candidate) =>
    current?.id
      ? candidate.songId === current.id
      : current &&
        candidate.title === current.title &&
        (!current.artist ||
          candidate.artist === current.artist ||
          candidate.channel === current.artist)
  );
  const previous = currentCandidate
    ? (recent.find(
        (turn) =>
          turn.selected &&
          voiceCandidateKey(turn.selected) ===
            voiceCandidateKey(currentCandidate)
      ) ?? {
        request: "",
        selected: currentCandidate
      })
    : (recent.find(
        (turn) =>
          turn.selected &&
          ["playing", "playback_requested"].includes(turn.outcome)
      ) ?? recent.find((turn) => turn.selected));
  const available = () =>
    [...candidates.entries()].filter(
      ([, candidate]) => !excluded.has(voiceCandidateKey(candidate))
    );
  const summarized = (candidateId: string, candidate: VoiceCandidate) => ({
    candidateId,
    title: candidate.title.slice(0, 120),
    ...modelVoiceMetadata(candidate),
    durationSeconds: Math.round(candidate.durationMs / 1000),
    source: candidate.source
  });
  const localLibrary = input.libraryCandidates
    ?.slice(0, 270)
    .map((candidate, index) => {
      const candidateId = `local-${index + 1}`;
      candidates.set(candidateId, candidate);
      return summarized(candidateId, candidate);
    });
  const messages: AgentMessage[] = [
    {
      role: "system",
      content:
        (input.systemPrompt ?? defaultVoicePrompt) +
        "\n\n" +
        voiceProtocolPrompt +
        `\nPreferred language: ${input.language}. Online search: ${input.online ? "enabled" : "disabled"}.`
    },
    ...(input.context
      ? [
          {
            role: "user" as const,
            content: `Playback context: ${JSON.stringify({
              ...input.context,
              recentRequests: input.context.recentRequests?.map((turn) => ({
                at: turn.at,
                transcript: turn.transcript,
                outcome: turn.outcome,
                ...(turn.rejected ? { rejected: true } : {}),
                selected: turn.selected
                  ? {
                      key: voiceCandidateKey(turn.selected),
                      title: turn.selected.title,
                      ...modelVoiceMetadata(turn.selected)
                    }
                  : undefined
              }))
            })}`
          }
        ]
      : []),
    ...(localLibrary !== undefined
      ? [{ role: "user" as const, content: JSON.stringify({ localLibrary }) }]
      : []),
    {
      role: "user",
      content: `Speech-recognition transcript: ${input.transcript}`
    }
  ];
  let searchedLocal = localLibrary !== undefined;
  const signal = AbortSignal.any([input.signal, AbortSignal.timeout(60_000)]);
  for (let turn = 0; turn < 6; turn++) {
    signal.throwIfAborted();
    input.onDecision?.();
    const tools = agentTools(input.online).filter(
      (item) =>
        !(
          item.function.name === "search_library" &&
          (localLibrary !== undefined ||
            (searchedLocal &&
              input.libraryHints &&
              input.libraryHints().length === 0))
        ) &&
        (item.function.name !== "play_result" || available().length > 0) &&
        (!["search_library", "search_youtube"].includes(item.function.name) ||
          searchCount < 3) &&
        (item.function.name !== "reject_previous" ||
          (previous && !rejectedPrevious)) &&
        (item.function.name !== "inspect_results" ||
          (input.inspectCandidate &&
            inspected.size < 3 &&
            available().some(
              ([, candidate]) =>
                candidate.videoId && !inspected.has(candidate.videoId)
            ))) &&
        (turn < 5 ||
          ["play_result", "finish_without_playing"].includes(
            item.function.name
          ))
    );
    const play = tools.find((item) => item.function.name === "play_result");
    if (play)
      Object.assign(play.function.parameters.properties.candidateId, {
        enum: available().map(([id]) => id)
      });
    const inspect = tools.find(
      (item) => item.function.name === "inspect_results"
    );
    if (inspect) {
      inspect.function.parameters.properties.candidateIds.items!.enum =
        available()
          .filter(
            ([, candidate]) =>
              candidate.videoId && !inspected.has(candidate.videoId)
          )
          .map(([id]) => id);
      inspect.function.parameters.properties.candidateIds.maxItems =
        3 - inspected.size;
    }
    const raw = await input.complete(messages, tools, signal);
    signal.throwIfAborted();
    const parsed = messageSchema.safeParse(raw);
    if (!parsed.success) {
      input.onInvalidAction?.();
      // Some OpenAI-compatible servers ignore tool_choice. Repair within the
      // same bounded budget; never display their conversational response.
      messages.push({
        role: "user",
        content:
          "Invalid response. Return exactly one available tool action, with valid arguments. Do not answer in prose or ask questions."
      });
      continue;
    }
    const call = parsed.data.tool_calls[0];
    let args: unknown;
    try {
      args = JSON.parse(call.function.arguments);
    } catch {
      input.onInvalidAction?.();
      return {
        reason: "I couldn't understand that request. Please try again."
      };
    }
    const name = call.function.name;
    if (!tools.some((item) => item.function.name === name)) {
      input.onInvalidAction?.();
      return { reason: "I couldn't choose a song. Please try again." };
    }
    if (name === "reject_previous") {
      const parsed = z
        .object({
          reason: z.enum(["different_song", "wrong_artist", "wrong_version"])
        })
        .strict()
        .safeParse(args);
      if (!parsed.success || !previous?.selected)
        return { reason: "I couldn't choose a song. Please try again." };
      rejectedPrevious = true;
      excluded.add(voiceCandidateKey(previous.selected));
      for (const turn of input.context?.recentRequests ?? [])
        if (
          turn.selected &&
          (turn.rejected || turn.request === previous.request)
        )
          excluded.add(voiceCandidateKey(turn.selected));
      if (previous.request) input.onRejectPrevious?.(previous.request);
      messages.push(
        { role: "assistant", content: null, tool_calls: [call] },
        {
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({
            excludedSongKeys: [...excluded],
            localResults: available()
              .filter(([, candidate]) => candidate.source === "library")
              .map(([id, candidate]) => summarized(id, candidate)),
            hint: "Choose a different song. Cached copies of rejected videos are also excluded. Preserve the earlier topic and apply the new correction; search online if needed."
          })
        }
      );
      continue;
    }
    if (name === "inspect_results") {
      const parsed = z
        .object({ candidateIds: z.array(z.string()).min(1).max(3) })
        .strict()
        .safeParse(args);
      const ids = parsed.success ? [...new Set(parsed.data.candidateIds)] : [];
      if (
        !ids.length ||
        ids.some(
          (id) =>
            !available().some(
              ([key, candidate]) =>
                key === id &&
                candidate.videoId &&
                !inspected.has(candidate.videoId)
            )
        )
      )
        return { reason: "I couldn't choose a song. Please try again." };
      const videos = new Set(ids.map((id) => candidates.get(id)!.videoId!));
      if (inspected.size + videos.size > 3)
        return { reason: "I couldn't choose a song. Please try again." };
      const details = await Promise.all(
        [...videos].map(async (videoId) => {
          inspected.add(videoId);
          const candidate = candidates.get(
            ids.find((id) => candidates.get(id)!.videoId === videoId)!
          )!;
          let metadata: VoiceMetadata | undefined;
          try {
            metadata = await input.inspectCandidate!(candidate, signal);
          } catch {
            signal.throwIfAborted();
          }
          signal.throwIfAborted();
          if (metadata)
            for (const [id, entry] of candidates)
              if (entry.videoId === videoId)
                candidates.set(id, {
                  ...entry,
                  ...metadata,
                  artist: metadata.artist ?? entry.artist
                });
          return { videoId, available: metadata !== undefined };
        })
      );
      messages.push(
        { role: "assistant", content: null, tool_calls: [call] },
        {
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({
            results: ids.map((id) => ({
              ...summarized(id, candidates.get(id)!),
              metadataAvailable: details.find(
                (detail) => detail.videoId === candidates.get(id)!.videoId
              )?.available
            })),
            hint: "Unknown metadata is not a rejection. Choose the best reasonable candidate if further details are unavailable."
          })
        }
      );
      continue;
    }
    if (name === "finish_without_playing") {
      const result = z
        .object({ reason: z.enum(["no_match", "not_music", "unintelligible"]) })
        .strict()
        .safeParse(args);
      if (
        result.success &&
        result.data.reason === "no_match" &&
        !searchedLocal &&
        turn < 5
      ) {
        messages.push({
          role: "user",
          content:
            "Search the local library before giving up. Match the topic or a related song, not an exact title."
        });
        continue;
      }
      return {
        reason: result.success
          ? noPlayMessages[result.data.reason]
          : noPlayMessages.no_match
      };
    }
    if (name === "play_result") {
      const result = z
        .object({ candidateId: z.string() })
        .strict()
        .safeParse(args);
      const candidate = result.success
        ? candidates.get(result.data.candidateId)
        : undefined;
      if (
        !candidate ||
        !searchedLocal ||
        excluded.has(voiceCandidateKey(candidate))
      )
        input.onInvalidAction?.();
      return candidate &&
        searchedLocal &&
        !excluded.has(voiceCandidateKey(candidate))
        ? { candidate }
        : { reason: "I couldn't find that song. Please try again." };
    }
    if (
      turn === 5 ||
      searchCount >= 3 ||
      !["search_library", "search_youtube"].includes(name)
    ) {
      input.onInvalidAction?.();
      return { reason: "I couldn't choose a song. Please try again." };
    }
    const query = (
      name === "search_youtube"
        ? querySchema.extend({
            scope: z.enum(["preferred", "all"]).default("preferred")
          })
        : querySchema
    ).safeParse(args);
    if (
      !query.success ||
      (name === "search_library" && localLibrary !== undefined) ||
      (name === "search_youtube" && (!input.online || !searchedLocal))
    ) {
      input.onInvalidAction?.();
      return { reason: "I couldn't find a suitable song. Please try again." };
    }
    messages.push({
      role: "assistant",
      content: null,
      tool_calls: [call]
    });
    input.onSearch?.();
    searchCount++;
    let results: VoiceCandidate[];
    if (name === "search_library") {
      searchedLocal = true;
      results = await input.searchLibrary(query.data.query);
    } else {
      results = await input.searchYoutube(
        query.data.query,
        signal,
        "scope" in query.data
          ? (query.data.scope as "preferred" | "all")
          : "preferred"
      );
    }
    signal.throwIfAborted();
    const found = results
      .filter((candidate) => !excluded.has(voiceCandidateKey(candidate)))
      .slice(0, 8)
      .map((candidate) => {
        const candidateId = crypto.randomUUID();
        candidates.set(candidateId, candidate);
        return summarized(candidateId, candidate);
      });
    messages.push({
      role: "tool",
      tool_call_id: call.id,
      content: JSON.stringify({
        results: found,
        ...(found.length === 0 && name === "search_library"
          ? {
              libraryTitles: input.libraryHints?.().slice(0, 270) ?? [],
              hint: "These titles are context for finding related topics. Search again with a broader topic to obtain candidate IDs."
            }
          : {})
      })
    });
  }
  return { reason: "I couldn't choose a song. Please try again." };
}
