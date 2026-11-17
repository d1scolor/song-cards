import type { AgentMessage, agentTools } from "@/lib/voice-agent";

// Both wire protocols produce the same validated internal tool call. Keeping
// JSON mode separate avoids depending on a server's tool-call parser/template.
export function structuredActionFormat(tools: ReturnType<typeof agentTools>) {
  return {
    type: "json_schema",
    json_schema: {
      name: "song_action",
      strict: true,
      schema: {
        type: "object",
        anyOf: tools.map(({ function: tool }) => ({
          type: "object",
          additionalProperties: false,
          description: tool.description,
          properties: {
            tool: { type: "string", enum: [tool.name] },
            arguments: tool.parameters
          },
          required: ["tool", "arguments"]
        }))
      }
    }
  };
}

export function jsonActionMessages(messages: AgentMessage[]) {
  return messages.map((message) => {
    if (message.role === "tool")
      return {
        role: "user",
        content: JSON.stringify({
          tool_result: JSON.parse(message.content ?? "{}")
        })
      };
    if (message.tool_calls?.length) {
      const tool = message.tool_calls[0].function;
      return {
        role: "assistant",
        content: JSON.stringify({
          tool: tool.name,
          arguments: JSON.parse(tool.arguments)
        })
      };
    }
    return { role: message.role, content: message.content };
  });
}

export function decodeJsonAction(message: unknown) {
  if (
    !message ||
    typeof message !== "object" ||
    !("content" in message) ||
    typeof message.content !== "string"
  )
    return message;
  try {
    const action = JSON.parse(message.content);
    if (
      typeof action?.tool !== "string" ||
      !action.arguments ||
      typeof action.arguments !== "object" ||
      Array.isArray(action.arguments) ||
      Object.keys(action).some((key) => !["tool", "arguments"].includes(key))
    )
      return message;
    return {
      content: null,
      tool_calls: [
        {
          id: crypto.randomUUID(),
          type: "function",
          function: {
            name: action.tool,
            arguments: JSON.stringify(action.arguments)
          }
        }
      ]
    };
  } catch {
    return message;
  }
}
