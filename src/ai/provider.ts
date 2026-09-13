import { Channel, invoke } from "@tauri-apps/api/core";
import { getStoredApiKey } from "../settings/api-keys";

export type LlmEvent =
  | { type: "ThinkingDelta"; payload: string }
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

function determineProvider(model: string): "anthropic" | "openai" | "openrouter" | "gemini" | "ollama" {
  const m = model.toLowerCase();
  if (m.includes("claude") || m.includes("fable") || m.includes("mythos")) return "anthropic";
  if (m.includes("gemini")) return "gemini";
  if (m.includes("ollama") || m.includes("localhost")) return "ollama";
  if (
    m.includes("/") ||
    m.includes("deepseek") ||
    m.includes("qwen") ||
    m.includes("kimi") ||
    m.includes("glm") ||
    m.includes("grok") ||
    m.includes("leanstral") ||
    m.includes("command-a")
  ) {
    return "openrouter";
  }
  return "openai";
}

function calculateCost(model: string, inTok: number, outTok: number): number {
  const m = model.toLowerCase();
  if (m.includes("ollama") || m.includes("localhost")) return 0;
  let inRate = 1.5;
  let outRate = 6.0;
  if (m.includes("fable") || m.includes("mythos") || m.includes("claude")) {
    inRate = 3.0;
    outRate = 15.0;
  } else if (m.includes("gpt-6") || m.includes("astra") || m.includes("gpt") || m.includes("o1") || m.includes("o3")) {
    inRate = 2.5;
    outRate = 10.0;
  } else if (m.includes("gemini")) {
    inRate = 0.15;
    outRate = 0.60;
  } else if (m.includes("deepseek")) {
    inRate = 0.50;
    outRate = 2.0;
  }
  return (inTok * inRate + outTok * outRate) / 1_000_000;
}

/**
 * Direct web browser SSE fetch fallback when running outside Tauri or in preview mode.
 */
async function* streamLlmWeb(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  options: StreamOptions
): AsyncIterable<LlmEvent> {
  const model = options.model ?? "gpt-6-astra";
  const provider = options.provider ?? determineProvider(model);
  const apiKey = getStoredApiKey(provider) || "";

  if (!apiKey && provider !== "ollama") {
    yield {
      type: "Error",
      payload: `API key is not configured for ${provider.toUpperCase()}. Please open Settings (⚙) and add your API key.`,
    };
    yield { type: "Done" };
    return;
  }

  const system =
    options.system ??
    "You are the senior Yones IDE AI engineer agent. You output unified SEARCH/REPLACE blocks for file modifications.";

  try {
    if (provider === "anthropic") {
      const anthropicTools = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));

      const payload: Record<string, unknown> = {
        model,
        max_tokens: 4096,
        system,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
      };
      if (anthropicTools.length > 0) {
        payload.tools = anthropicTools;
      }

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify(payload),
        signal: options.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        yield { type: "Error", payload: `Anthropic API error ${res.status}: ${errText}` };
        yield { type: "Done" };
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        yield { type: "Error", payload: "Response body stream unavailable." };
        yield { type: "Done" };
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let inTok = 0;
      let outTok = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const block of parts) {
          for (const line of block.split("\n")) {
            if (line.startsWith("data: ")) {
              const raw = line.slice(6).trim();
              if (raw === "[DONE]") {
                yield { type: "Done" };
                return;
              }
              try {
                const parsed = JSON.parse(raw);
                if (parsed.type === "message_start") {
                  inTok = parsed.message?.usage?.input_tokens ?? 0;
                } else if (parsed.type === "content_block_delta") {
                  if (parsed.delta?.type === "text_delta" && parsed.delta?.text) {
                    yield { type: "TextDelta", payload: parsed.delta.text };
                  } else if (parsed.delta?.type === "thinking_delta" && parsed.delta?.thinking) {
                    yield { type: "ThinkingDelta", payload: parsed.delta.thinking };
                  }
                } else if (parsed.type === "message_delta") {
                  outTok = parsed.usage?.output_tokens ?? 0;
                  yield {
                    type: "Usage",
                    payload: {
                      input_tokens: inTok,
                      output_tokens: outTok,
                      cost_usd: calculateCost(model, inTok, outTok),
                    },
                  };
                }
              } catch {
                // Ignore chunk parse errors
              }
            }
          }
        }
      }

      yield { type: "Done" };
      return;
    }

    // OpenAI-compatible providers: OpenRouter, OpenAI, Gemini, Ollama
    let endpoint = "https://api.openai.com/v1/chat/completions";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (provider === "openrouter") {
      endpoint = "https://openrouter.ai/api/v1/chat/completions";
      headers["Authorization"] = `Bearer ${apiKey}`;
      headers["HTTP-Referer"] = "https://yones.ide";
      headers["X-Title"] = "Yones IDE";
    } else if (provider === "openai") {
      endpoint = "https://api.openai.com/v1/chat/completions";
      headers["Authorization"] = `Bearer ${apiKey}`;
    } else if (provider === "gemini") {
      endpoint = `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`;
      headers["Authorization"] = `Bearer ${apiKey}`;
    } else if (provider === "ollama") {
      endpoint = "http://localhost:11434/v1/chat/completions";
    }

    const allMessages: { role: string; content: string }[] = [
      { role: "system", content: system },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const openAiTools = tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const reqPayload: Record<string, unknown> = {
      model,
      messages: allMessages,
      stream: true,
      stream_options: { include_usage: true },
    };
    if (openAiTools.length > 0) {
      reqPayload.tools = openAiTools;
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(reqPayload),
      signal: options.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      let errorMsg = `HTTP ${res.status}: ${errText}`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error?.message) errorMsg = parsed.error.message;
      } catch {
        // use raw
      }
      yield { type: "Error", payload: errorMsg };
      yield { type: "Done" };
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      yield { type: "Error", payload: "Response body stream unavailable." };
      yield { type: "Done" };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    const activeToolCalls = new Map<number, { id: string; name: string; args: string }>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const block of parts) {
        for (const line of block.split("\n")) {
          if (line.startsWith("data: ")) {
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") {
              // Flush tools
              for (const [, tool] of activeToolCalls) {
                if (tool.name) {
                  yield {
                    type: "ToolCall",
                    payload: { id: tool.id, name: tool.name, arguments: tool.args },
                  };
                }
              }
              yield { type: "Done" };
              return;
            }

            try {
              const parsed = JSON.parse(raw);
              if (parsed.usage) {
                const inTok = parsed.usage.prompt_tokens ?? 0;
                const outTok = parsed.usage.completion_tokens ?? 0;
                yield {
                  type: "Usage",
                  payload: {
                    input_tokens: inTok,
                    output_tokens: outTok,
                    cost_usd: calculateCost(model, inTok, outTok),
                  },
                };
              }

              const choice = parsed.choices?.[0];
              if (choice?.delta) {
                const delta = choice.delta;
                // Reasoning / Thinking Delta (DeepSeek, OpenRouter, OpenAI o1/o3/Astra, Gemini)
                if (delta.reasoning_content) {
                  yield { type: "ThinkingDelta", payload: delta.reasoning_content };
                } else if (delta.reasoning) {
                  yield { type: "ThinkingDelta", payload: delta.reasoning };
                }

                // Text Content
                if (delta.content) {
                  yield { type: "TextDelta", payload: delta.content };
                }

                // Tool Calls
                if (Array.isArray(delta.tool_calls)) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? 0;
                    if (!activeToolCalls.has(idx)) {
                      activeToolCalls.set(idx, {
                        id: tc.id ?? `call_${idx}`,
                        name: tc.function?.name ?? "",
                        args: tc.function?.arguments ?? "",
                      });
                    } else {
                      const cur = activeToolCalls.get(idx)!;
                      if (tc.id) cur.id = tc.id;
                      if (tc.function?.name) cur.name += tc.function.name;
                      if (tc.function?.arguments) cur.args += tc.function.arguments;
                    }
                  }
                }
              }

              if (choice?.finish_reason === "tool_calls") {
                for (const [, tool] of activeToolCalls) {
                  if (tool.name) {
                    yield {
                      type: "ToolCall",
                      payload: { id: tool.id, name: tool.name, arguments: tool.args },
                    };
                  }
                }
                activeToolCalls.clear();
              }
            } catch {
              // Ignore invalid JSON chunk
            }
          }
        }
      }
    }

    yield { type: "Done" };
  } catch (err: unknown) {
    if ((err as Error)?.name === "AbortError") {
      yield { type: "Done" };
    } else {
      yield { type: "Error", payload: (err as Error)?.message || String(err) };
      yield { type: "Done" };
    }
  }
}

export async function* streamLlm(
  messages: ChatMessage[],
  tools: ToolDefinition[] = [],
  options: StreamOptions = {}
): AsyncIterable<LlmEvent> {
  const isTauri =
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

  // If outside Tauri desktop container (e.g. running in web browser dev preview), use web fetch stream
  if (!isTauri) {
    yield* streamLlmWeb(messages, tools, options);
    return;
  }

  const channel = new Channel<LlmEvent>();
  const streamId = crypto.randomUUID();

  const queue: LlmEvent[] = [];
  let resolveNext: ((value: IteratorResult<LlmEvent>) => void) | null = null;
  let isDone = false;

  channel.onmessage = (event: LlmEvent) => {
    if (event.type === "Done") {
      isDone = true;
    }

    if (resolveNext) {
      const resolver = resolveNext;
      resolveNext = null;
      resolver({ done: false, value: event });
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
    model: options.model ?? "gpt-6-astra",
    system:
      options.system ??
      "You are the senior Yones IDE AI engineer agent. You output unified SEARCH/REPLACE blocks for file modifications.",
    messages,
    tools,
    channel,
  }).catch((err) => {
    // Surface invoke failure directly through queue
    const errEvent: LlmEvent = { type: "Error", payload: String(err) };
    if (resolveNext) {
      const resolver = resolveNext;
      resolveNext = null;
      resolver({ done: false, value: errEvent });
    } else {
      queue.push(errEvent);
    }
    isDone = true;
  });

  try {
    while (true) {
      if (queue.length > 0) {
        const item = queue.shift()!;
        yield item;
        if (item.type === "Done") break;
      } else if (isDone) {
        break;
      } else {
        const nextItem = await new Promise<IteratorResult<LlmEvent>>((resolve) => {
          resolveNext = resolve;
        });
        if (nextItem.done) {
          break;
        }
        yield nextItem.value;
        if (nextItem.value.type === "Done") break;
      }
    }
  } finally {
    options.signal?.removeEventListener("abort", abortListener);
  }
}
