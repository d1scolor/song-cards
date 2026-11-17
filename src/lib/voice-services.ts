import { z } from "zod";
import type { AgentMessage, agentTools } from "@/lib/voice-agent";
import type { VoiceSettings } from "@/lib/voice-settings";
import {
  decodeJsonAction,
  jsonActionMessages,
  structuredActionFormat
} from "@/lib/voice-action-format";
import { VoiceOperationError } from "@/lib/voice-errors";

async function serviceRequest(
  url: string,
  key: string,
  body: BodyInit,
  signal: AbortSignal,
  json = false
) {
  const response = await fetch(url, {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    headers: {
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...(json ? { "content-type": "application/json" } : {})
    },
    body,
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)])
  });
  // Service error bodies can contain credentials or installation details.
  if (!response.ok)
    throw new VoiceOperationError("service_http_error", response.status);
  const reader = response.body?.getReader();
  if (!reader) throw new VoiceOperationError("invalid_response");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 200_000) {
        await reader.cancel();
        throw new VoiceOperationError("invalid_response");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(text) as unknown;
}

export async function transcribeVoice(
  audio: File,
  settings: VoiceSettings,
  signal: AbortSignal
) {
  const form = new FormData();
  form.set("model", settings.asrModel);
  form.set("file", audio, "request.wav");
  const body = await serviceRequest(
    settings.asrUrl,
    settings.asrApiKey,
    form,
    signal
  );
  return z.object({ text: z.string().trim().max(2000) }).parse(body).text;
}

export async function completeVoice(
  settings: VoiceSettings,
  messages: AgentMessage[],
  tools: ReturnType<typeof agentTools>,
  signal: AbortSignal
) {
  const body = await serviceRequest(
    settings.llmUrl,
    settings.llmApiKey,
    JSON.stringify({
      model: settings.llmModel,
      ...(settings.outputMode === "tools"
        ? {
            messages,
            tools,
            tool_choice: "required",
            parallel_tool_calls: false
          }
        : {
            messages: jsonActionMessages(messages),
            response_format: structuredActionFormat(tools)
          }),
      temperature: 0.2,
      max_tokens: 768
    }),
    signal,
    true
  );
  const message = z
    .object({ choices: z.array(z.object({ message: z.unknown() })).min(1) })
    .parse(body).choices[0].message;
  return settings.outputMode === "tools" ? message : decodeJsonAction(message);
}
