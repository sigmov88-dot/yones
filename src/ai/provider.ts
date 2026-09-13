import { Channel, invoke } from "@tauri-apps/api/core";

export type LlmEvent =
  | { type: "TextDelta"; payload: string }
  | { type: "ToolCall"; payload: { id: string; name: string; arguments: string } }
  | { type: "ToolResult"; payload: { id: string; result: string } }
  | { type: "Usage"; payload: { input_tokens: number; output_tokens: number; cost_usd: number } }
  | { type: "Done" }
  | { type: "Error"; payload: string };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface StreamOptions {
  provider?: "anthropic" | "openai" | "openrouter" | "gemini" | "ollama";
  model?: string;
  system?: string;
  signal?: AbortSignal;
}

export async function* streamLlm(
  messages: ChatMessage[],
  tools: ToolDefinition[] = [],
  options: StreamOptions = {}
): AsyncIterable<LlmEvent> {
  const channel = new Channel<LlmEvent>();
  const streamId = crypto.randomUUID();

  const queue: LlmEvent[] = [];
  let resolveNext: ((value: IteratorResult<LlmEvent>) => void) | null = null;
  let isDone = false;
  let streamError: Error | null = null;

  channel.onmessage = (event: LlmEvent) => {
    if (event.type === "Done") {
      isDone = true;
    } else if (event.type === "Error") {
      streamError = new Error(event.payload);
      isDone = true;
    }

    if (resolveNext) {
      const resolver = resolveNext;
      resolveNext = null;
      if (streamError) {
        resolver({ done: true, value: undefined });
      } else {
        resolver({ done: false, value: event });
      }
    } else {
      queue.push(event);
    }
  };

  const abortListener = () => {
    void invoke("abort_stream", { streamId });
    isDone = true;
    if (resolveNext) {
      resolveNext({ done: true, value: undefined });
      resolveNext = null;
    }
  };

  options.signal?.addEventListener("abort", abortListener, { once: true });

  void invoke("start_llm_stream", {
    streamId,
    provider: options.provider,
    model: options.model ?? "claude-3-7-sonnet-20250219",
    system: options.system ?? "You are Yones IDE agent. You output unified SEARCH/REPLACE blocks for file modifications.",
    messages,
    tools,
    channel,
  }).catch((err) => {
    streamError = new Error(String(err));
    isDone = true;
    if (resolveNext) {
      resolveNext({ done: true, value: undefined });
      resolveNext = null;
    }
  });

  try {
    while (true) {
      if (queue.length > 0) {
        const item = queue.shift()!;
        yield item;
        if (item.type === "Done" || item.type === "Error") break;
      } else if (isDone) {
        if (streamError) throw streamError;
        break;
      } else {
        const nextItem = await new Promise<IteratorResult<LlmEvent>>((resolve) => {
          resolveNext = resolve;
        });
        if (nextItem.done) {
          if (streamError) throw streamError;
          break;
        }
        yield nextItem.value;
      }
    }
  } finally {
    options.signal?.removeEventListener("abort", abortListener);
  }
}
