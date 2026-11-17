import { z } from "zod";
import {
  defaultVoicePrompt,
  voiceProtocolPrompt,
  noPlayMessages
} from "@/lib/voice-prompt";

export type VoiceCandidate = {
  title: string;
  artist: string;
  durationMs: number;
} & (
  | { source: "library"; songId: string }
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
        properties: { [field]: { type: "string" } },
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
      "Select a song from this request's search results.",
      "candidateId"
    ),
    tool(
      "finish_without_playing",
      "Finish only when no reasonable related song exists or the request is not usable. Use a reason code, never prose or a question.",
      "reason"
    )
  ];
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
    currentSong?: { title: string; artist: string };
    preferredChannels?: string[];
  };
  signal: AbortSignal;
  complete: (
    messages: AgentMessage[],
    tools: ReturnType<typeof agentTools>,
    signal: AbortSignal
  ) => Promise<unknown>;
  searchLibrary: (query: string) => Promise<VoiceCandidate[]>;
  libraryHints?: () => string[];
  searchYoutube: (
    query: string,
    signal: AbortSignal,
    scope: "preferred" | "all"
  ) => Promise<VoiceCandidate[]>;
  onSearch?: () => void;
  onDecision?: () => void;
}): Promise<AgentDecision> {
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
            content: `Playback context: ${JSON.stringify(input.context)}`
          }
        ]
      : []),
    { role: "user", content: input.transcript }
  ];
  const candidates = new Map<string, VoiceCandidate>();
  let searchedLocal = false;
  const signal = AbortSignal.any([input.signal, AbortSignal.timeout(60_000)]);
  for (let turn = 0; turn < 4; turn++) {
    signal.throwIfAborted();
    input.onDecision?.();
    const tools = agentTools(input.online).filter(
      (item) =>
        !(
          item.function.name === "search_library" &&
          searchedLocal &&
          input.libraryHints &&
          input.libraryHints().length === 0
        ) &&
        (item.function.name !== "play_result" || candidates.size > 0) &&
        (turn < 3 ||
          ["play_result", "finish_without_playing"].includes(
            item.function.name
          ))
    );
    const play = tools.find((item) => item.function.name === "play_result");
    if (play)
      Object.assign(play.function.parameters.properties.candidateId, {
        enum: [...candidates.keys()]
      });
    const raw = await input.complete(messages, tools, signal);
    signal.throwIfAborted();
    const parsed = messageSchema.safeParse(raw);
    if (!parsed.success) {
      // Some OpenAI-compatible servers ignore tool_choice. Repair within the
      // same four-turn budget; never display their conversational response.
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
      return {
        reason: "I couldn't understand that request. Please try again."
      };
    }
    const name = call.function.name;
    if (name === "finish_without_playing") {
      const result = z
        .object({ reason: z.enum(["no_match", "not_music", "unintelligible"]) })
        .strict()
        .safeParse(args);
      if (
        result.success &&
        result.data.reason === "no_match" &&
        !searchedLocal &&
        turn < 3
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
      return candidate && searchedLocal
        ? { candidate }
        : { reason: "I couldn't find that song. Please try again." };
    }
    if (turn === 3 || !["search_library", "search_youtube"].includes(name)) {
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
      (name === "search_youtube" && (!input.online || !searchedLocal))
    ) {
      return { reason: "I couldn't find a suitable song. Please try again." };
    }
    messages.push({
      role: "assistant",
      content: null,
      tool_calls: [call]
    });
    input.onSearch?.();
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
    const found = results.slice(0, 8).map((candidate) => {
      const candidateId = crypto.randomUUID();
      candidates.set(candidateId, candidate);
      return {
        candidateId,
        title: candidate.title,
        artist: candidate.artist,
        durationSeconds: Math.round(candidate.durationMs / 1000),
        source: candidate.source
      };
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
