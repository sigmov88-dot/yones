import { createSignal, onMount, onCleanup, Show, For } from "solid-js";
import { MessageList, type ChatEntry } from "./MessageList";
import { ContextChips } from "./ContextChips";
import { streamLlm, type ChatMessage } from "../ai/provider";
import { createStreamReducer } from "../ai/stream-reducer";
import { AGENT_TOOLS, executeTool } from "../ai/tools";
import { parseSearchReplaceBlocks, generateUnifiedDiff } from "../ai/edit-parser";

export interface AssistantPanelProps {
  availableFiles: string[];
  currentFilePath?: string;
  hasApiKey?: boolean;
  onApplyMultiFilePatch: (
    patches: { filePath: string; blocks: { search: string; replace: string }[] }[],
    txId: string
  ) => Promise<boolean> | void;
  onRevertMultiFilePatch?: (txId: string, filePaths: string[]) => Promise<boolean> | void;
  onOpenSettings?: () => void;
  onClose: () => void;
}

export function AssistantPanel(props: AssistantPanelProps) {
  const [messages, setMessages] = createSignal<ChatEntry[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Yones Assistant ready. Use @ to reference files or ask to inspect and edit your project.",
    },
  ]);

  const [inputVal, setInputVal] = createSignal("");
  const [contextFiles, setContextFiles] = createSignal<string[]>([]);
  const [mentionMenuOpen, setMentionMenuOpen] = createSignal(false);
  const [mentionFilter, setMentionFilter] = createSignal("");

  const streamReducer = createStreamReducer();
  let inputRef!: HTMLTextAreaElement;
  let abortController: AbortController | null = null;

  const filteredMentionFiles = () => {
    const q = mentionFilter().toLowerCase();
    return props.availableFiles.filter((f) => f.toLowerCase().includes(q)).slice(0, 8);
  };

  const handleInput = (e: InputEvent) => {
    const val = (e.target as HTMLTextAreaElement).value;
    setInputVal(val);

    const atIndex = val.lastIndexOf("@");
    if (atIndex !== -1 && atIndex >= val.length - 20) {
      setMentionMenuOpen(true);
      setMentionFilter(val.slice(atIndex + 1));
    } else {
      setMentionMenuOpen(false);
    }
  };

  const selectMention = (file: string) => {
    if (!contextFiles().includes(file)) {
      setContextFiles((prev) => [...prev, file]);
    }
    const val = inputVal();
    const atIndex = val.lastIndexOf("@");
    if (atIndex !== -1) {
      setInputVal(val.slice(0, atIndex) + "@" + file + " ");
    }
    setMentionMenuOpen(false);
    inputRef.focus();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (mentionMenuOpen()) {
        setMentionMenuOpen(false);
      } else if (streamReducer.state().isStreaming) {
        abortController?.abort();
        streamReducer.abort();
      } else {
        props.onClose();
      }
    } else if (e.key === "Enter" && !e.shiftKey && !streamReducer.state().isStreaming) {
      e.preventDefault();
      sendMessage();
    }
  };

  const sendMessage = async () => {
    const text = inputVal().trim();
    if (!text) return;

    setInputVal("");
    setMentionMenuOpen(false);

    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", text },
      { id: assistantMsgId, role: "assistant", text: "", toolCalls: [] },
    ]);

    abortController = new AbortController();
    streamReducer.start();

    let systemPrompt =
      "You are the senior Yones IDE AI engineer agent. You have tools: read_file, list_dir, search, apply_diff, run_command.\n" +
      "When suggesting file edits, produce SEARCH/REPLACE blocks formatted like:\n" +
      "### path/to/file.ts\n" +
      "<<<<<<< SEARCH\n[original code]\n=======\n[replacement code]\n>>>>>>> REPLACE\n";

    if (contextFiles().length > 0) {
      systemPrompt += `\nIncluded context files: ${contextFiles().join(", ")}`;
    }

    const conversation: ChatMessage[] = messages()
      .filter((m) => m.id !== "welcome" && m.id !== assistantMsgId)
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.text,
      }));

    try {
      let isLoopDone = false;
      let iterations = 0;

      while (!isLoopDone && iterations < 5) {
        iterations++;
        const stream = streamLlm(conversation, AGENT_TOOLS, {
          system: systemPrompt,
          signal: abortController.signal,
        });

        let accumulatedText = "";
        let pendingToolCall: { id: string; name: string; arguments: string } | null = null;

        for await (const event of stream) {
          streamReducer.processEvent(event);

          if (event.type === "TextDelta") {
            accumulatedText += event.payload;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsgId ? { ...m, text: accumulatedText } : m))
            );
          } else if (event.type === "ToolCall") {
            pendingToolCall = event.payload;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      toolCalls: [
                        ...(m.toolCalls || []),
                        {
                          id: pendingToolCall!.id,
                          name: pendingToolCall!.name,
                          args: pendingToolCall!.arguments,
                          status: "running",
                        },
                      ],
                    }
                  : m
              )
            );
          }
        }

        if (pendingToolCall) {
          const toolResult = await executeTool(pendingToolCall.name, pendingToolCall.arguments);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    toolCalls: (m.toolCalls || []).map((t) =>
                      t.id === pendingToolCall!.id ? { ...t, status: "done" } : t
                    ),
                  }
                : m
            )
          );

          conversation.push({ role: "assistant", content: accumulatedText });
          conversation.push({
            role: "user",
            content: `Tool result for ${pendingToolCall.name}:\n${toolResult}`,
          });
        } else {
          isLoopDone = true;
          const patches = parseSearchReplaceBlocks(accumulatedText);
          if (patches.length > 0) {
            const formatted = patches.map((p) => ({
              filePath: p.filePath,
              diffLines: p.blocks.flatMap((b) => generateUnifiedDiff(b.search, b.replace)),
            }));

            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsgId ? { ...m, filePatches: formatted } : m))
            );
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") {
        console.error("Assistant execution error:", err);
      }
    }
  };

  const applyPatchesFromMessage = async (idx: number) => {
    const msg = messages()[idx];
    if (!msg) return;

    const patches = parseSearchReplaceBlocks(msg.text);
    if (patches.length > 0) {
      const txId = msg.txId || crypto.randomUUID();
      await props.onApplyMultiFilePatch(patches, txId);
      setMessages((prev) =>
        prev.map((m, i) => (i === idx ? { ...m, txId, applied: true } : m))
      );
    }
  };

  const revertPatchesFromMessage = async (idx: number) => {
    const msg = messages()[idx];
    if (!msg || !msg.txId) return;

    const patches = parseSearchReplaceBlocks(msg.text);
    const filePaths = patches.map((p) => p.filePath);
    if (props.onRevertMultiFilePatch) {
      await props.onRevertMultiFilePatch(msg.txId, filePaths);
      setMessages((prev) =>
        prev.map((m, i) => (i === idx ? { ...m, applied: false } : m))
      );
    }
  };

  onMount(() => {
    inputRef?.focus();
  });

  onCleanup(() => {
    abortController?.abort();
    streamReducer.abort();
  });

  return (
    <div class="h-full w-full flex flex-col bg-[var(--color-bg-panel)] border-l border-[var(--color-border-subtle)]">
      <div class="h-9 px-3 flex items-center justify-between border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)]">
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium text-[var(--color-fg-primary)]">Agent Assistant</span>
          <Show when={streamReducer.state().isStreaming}>
            <div class="h-2 w-2 rounded-full bg-[var(--color-accent)] animate-agent-working" />
          </Show>
        </div>
        <button
          type="button"
          class="text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] cursor-pointer"
          onClick={props.onClose}
        >
          &times;
        </button>
      </div>

      <Show when={props.hasApiKey === false}>
        <div class="mx-3 mt-2 p-2.5 rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-raised)] text-xs flex items-center justify-between">
          <span class="text-[var(--color-fg-muted)]">No API key configured</span>
          <button
            type="button"
            class="text-[var(--color-accent)] hover:underline font-medium cursor-pointer"
            onClick={props.onOpenSettings}
          >
            Configure &rarr;
          </button>
        </div>
      </Show>

      <MessageList
        messages={messages()}
        onApplyPatches={applyPatchesFromMessage}
        onRevertPatches={revertPatchesFromMessage}
      />

      <Show when={contextFiles().length > 0}>
        <ContextChips
          files={contextFiles()}
          onRemove={(f) => setContextFiles((prev) => prev.filter((x) => x !== f))}
        />
      </Show>

      <div class="p-2 border-t border-[var(--color-border-subtle)] relative">
        <Show when={mentionMenuOpen() && filteredMentionFiles().length > 0}>
          <div class="absolute bottom-full left-2 right-2 mb-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-raised)] shadow-lg max-h-48 overflow-y-auto z-50">
            <For each={filteredMentionFiles()}>
              {(file) => (
                <div
                  class="px-2 py-1.5 text-xs text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-active)] cursor-pointer font-mono truncate"
                  onClick={() => selectMention(file)}
                >
                  @{file}
                </div>
              )}
            </For>
          </div>
        </Show>

        <textarea
          ref={inputRef}
          rows={3}
          class="w-full resize-none rounded bg-[var(--color-bg-editor)] p-2 text-xs text-[var(--color-fg-primary)] placeholder-[var(--color-fg-muted)] border border-[var(--color-border-subtle)] outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent-ring)]"
          placeholder="Ask agent, type @ to mention files (Enter to send, Esc to cancel)..."
          value={inputVal()}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          disabled={streamReducer.state().isStreaming}
        />

        <div class="mt-1 flex items-center justify-between text-[10px] text-[var(--color-fg-muted)]">
          <span>Cmd+L: Toggle &bull; Esc: Abort stream</span>
          <Show when={streamReducer.state().costUsd > 0}>
            <span>${streamReducer.state().costUsd.toFixed(5)}</span>
          </Show>
        </div>
      </div>
    </div>
  );
}
