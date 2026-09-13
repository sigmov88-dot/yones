import { createSignal, onMount, onCleanup, Show, For } from "solid-js";
import { MessageList, type ChatEntry } from "./MessageList";
import { ContextChips } from "./ContextChips";
import { streamLlm, type ChatMessage } from "../ai/provider";
import { createStreamReducer } from "../ai/stream-reducer";
import { AGENT_TOOLS, executeTool } from "../ai/tools";
import { parseSearchReplaceBlocks, generateUnifiedDiff } from "../ai/edit-parser";
import {
  CloseIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  CheckIcon,
  GearIcon,
  SparklesIcon,
  SearchIcon,
  KeyIcon,
} from "../ui/icons";
import {
  getActiveModel,
  setActiveModel,
  getEnabledModels,
  type ModelInfo,
} from "../settings/models";

export interface AssistantPanelProps {
  availableFiles: string[];
  currentFilePath?: string;
  hasApiKey?: boolean;
  onApplyMultiFilePatch: (
    patches: { filePath: string; blocks: { search: string; replace: string }[] }[],
    txId: string
  ) => Promise<boolean> | void;
  onRevertMultiFilePatch?: (txId: string, filePaths: string[]) => Promise<boolean> | void;
  onOpenSettings?: (tab?: "keys" | "models") => void;
  onClose: () => void;
}

export function AssistantPanel(props: AssistantPanelProps) {
  const getWelcomeText = () => {
    const cur = getActiveModel();
    if (cur) {
      return `AI Assistant connected with ${cur.name} (${cur.provider.toUpperCase()}). Use @ to reference files or instruct edits.`;
    }
    return "No AI API key configured yet. Add an API key for Anthropic, OpenAI, OpenRouter, or Gemini to enable frontier models (GPT-6 Astra, Claude Fable 5.1, Gemini 3.8 Flash, etc.) and start coding.";
  };

  const [messages, setMessages] = createSignal<ChatEntry[]>([
    {
      id: "welcome",
      role: "assistant",
      text: getWelcomeText(),
    },
  ]);

  const [inputVal, setInputVal] = createSignal("");
  const [contextFiles, setContextFiles] = createSignal<string[]>([]);
  const [mentionMenuOpen, setMentionMenuOpen] = createSignal(false);
  const [mentionFilter, setMentionFilter] = createSignal("");

  // Model Selection state (Cursor-style)
  const [activeModel, setActiveModelSignal] = createSignal<ModelInfo | null>(getActiveModel());
  const [enabledModels, setEnabledModels] = createSignal<ModelInfo[]>(getEnabledModels());
  const [modelMenuOpen, setModelMenuOpen] = createSignal(false);
  const [modelSearch, setModelSearch] = createSignal("");

  const updateModelsFromStorage = () => {
    const cur = getActiveModel();
    setActiveModelSignal(cur);
    setEnabledModels(getEnabledModels());
    if (messages().length === 1 && messages()[0].id === "welcome") {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          text: getWelcomeText(),
        },
      ]);
    }
  };

  const filteredEnabledModels = () => {
    const q = modelSearch().toLowerCase().trim();
    const list = enabledModels();
    if (!q) return list;
    return list.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q)
    );
  };

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

    const chosenModel = activeModel();
    if (!chosenModel) {
      props.onOpenSettings?.("keys");
      return;
    }

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

      const modelToUse = chosenModel;
      while (!isLoopDone && iterations < 5) {
        iterations++;
        const stream = streamLlm(conversation, AGENT_TOOLS, {
          system: systemPrompt,
          signal: abortController.signal,
          model: modelToUse.id,
          provider: modelToUse.provider,
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
    window.addEventListener("yones-active-model-changed", updateModelsFromStorage);
    window.addEventListener("yones-model-registry-updated", updateModelsFromStorage);
  });

  onCleanup(() => {
    abortController?.abort();
    streamReducer.abort();
    window.removeEventListener("yones-active-model-changed", updateModelsFromStorage);
    window.removeEventListener("yones-model-registry-updated", updateModelsFromStorage);
  });

  return (
    <div class="h-full w-full flex flex-col bg-[var(--color-bg-panel)] border-l border-[var(--color-border-subtle)]">
      <div class="h-9 px-3 flex items-center justify-between border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)]">
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium text-[var(--color-fg-primary)]">AI Assistant</span>
          <Show when={streamReducer.state().isStreaming}>
            <div class="h-2 w-2 rounded-full bg-[var(--color-accent)] animate-agent-working" />
          </Show>
        </div>
        <div class="flex items-center gap-1.5">
          <Show when={!activeModel()}>
            <button
              type="button"
              class="px-2 py-0.5 rounded bg-[var(--color-warning)]/15 text-[var(--color-warning)] hover:bg-[var(--color-warning)]/25 border border-[var(--color-warning)]/40 text-[10px] font-medium cursor-pointer flex items-center gap-1"
              onClick={() => props.onOpenSettings?.("keys")}
              title="Click to configure API key"
            >
              <KeyIcon class="h-3 w-3" />
              <span>Add Key</span>
            </button>
          </Show>
          <button
            type="button"
            class="text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] cursor-pointer p-1 rounded hover:bg-[var(--color-bg-active)] flex items-center gap-1 text-[11px]"
            title="Configure Models (Cursor-style toggles)"
            onClick={() => props.onOpenSettings?.("models")}
          >
            <SparklesIcon class="h-3 w-3 text-[var(--color-accent)]" />
          </button>
          <button
            type="button"
            class="text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] cursor-pointer p-0.5 rounded hover:bg-[var(--color-bg-active)] flex items-center justify-center"
            onClick={props.onClose}
          >
            <CloseIcon class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <Show when={props.hasApiKey === false || !activeModel()}>
        <div class="mx-3 mt-2 p-2.5 rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-raised)] text-xs flex items-center justify-between">
          <span class="text-[var(--color-fg-muted)]">No AI API key configured</span>
          <button
            type="button"
            class="text-[var(--color-accent)] hover:underline font-medium cursor-pointer inline-flex items-center gap-1"
            onClick={() => props.onOpenSettings?.("keys")}
          >
            Configure Key
            <ChevronRightIcon class="h-3 w-3" />
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
          placeholder={
            activeModel()
              ? `Ask ${activeModel()!.name}, type @ to mention files (Enter to send, Esc to cancel)...`
              : "Configure an API key in settings to start asking questions..."
          }
          value={inputVal()}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          disabled={streamReducer.state().isStreaming}
        />

        <div class="mt-2 flex items-center justify-between gap-2">
          {/* Cursor-style Active Model Selector */}
          <div class="relative">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-[var(--color-bg-raised)] hover:bg-[var(--color-bg-active)] border transition-colors cursor-pointer"
              classList={{
                "text-[var(--color-fg-primary)] border-[var(--color-border-subtle)]": !!activeModel(),
                "text-[var(--color-warning)] border-[var(--color-warning)]/40": !activeModel(),
              }}
              onClick={() => setModelMenuOpen((v) => !v)}
              title={activeModel() ? "Select Active AI Model (Cursor-style)" : "No API key configured - Click to configure"}
            >
              <Show
                when={activeModel()}
                fallback={
                  <>
                    <KeyIcon class="h-3 w-3 text-[var(--color-warning)]" />
                    <span class="truncate max-w-[130px]">No API Key</span>
                    <ChevronDownIcon class="h-2.5 w-2.5 opacity-60" />
                  </>
                }
              >
                {(model) => (
                  <>
                    <SparklesIcon class="h-3 w-3 text-[var(--color-accent)]" />
                    <span class="truncate max-w-[125px]">{model().name}</span>
                    <ChevronDownIcon class="h-2.5 w-2.5 text-[var(--color-fg-muted)]" />
                  </>
                )}
              </Show>
            </button>

            {/* Model Selection Dropdown Popup */}
            <Show when={modelMenuOpen()}>
              {/* Overlay for closing on outside click */}
              <div
                class="fixed inset-0 z-40"
                onClick={() => setModelMenuOpen(false)}
              />

              <div class="absolute bottom-full left-0 mb-1.5 w-72 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-raised)] shadow-2xl z-50 overflow-hidden flex flex-col">
                {/* Search Bar */}
                <div class="p-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] flex items-center gap-1.5">
                  <SearchIcon class="h-3 w-3 text-[var(--color-fg-muted)] shrink-0" />
                  <input
                    type="text"
                    placeholder="Search enabled models..."
                    class="w-full text-[11px] bg-transparent text-[var(--color-fg-primary)] placeholder-[var(--color-fg-muted)] outline-none"
                    value={modelSearch()}
                    onInput={(e) => setModelSearch(e.currentTarget.value)}
                    autofocus
                  />
                  <Show when={modelSearch()}>
                    <button
                      type="button"
                      class="text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] cursor-pointer"
                      onClick={() => setModelSearch("")}
                    >
                      <CloseIcon class="h-3 w-3" />
                    </button>
                  </Show>
                </div>

                {/* Models List */}
                <div class="max-h-56 overflow-y-auto py-1 divide-y divide-[var(--color-border-subtle)]">
                  <Show
                    when={filteredEnabledModels().length > 0}
                    fallback={
                      <div class="py-6 px-4 text-center space-y-2">
                        <div class="text-xs font-semibold text-[var(--color-fg-primary)]">
                          No models enabled
                        </div>
                        <div class="text-[11px] text-[var(--color-fg-muted)] leading-relaxed">
                          Add an API key in Settings to activate models (GPT-6 Astra, Claude Fable 5.1, Gemini 3.8 Flash, etc.).
                        </div>
                        <button
                          type="button"
                          class="mt-1 inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded bg-[var(--color-accent)] text-white font-medium hover:bg-[var(--color-accent-hover)] cursor-pointer"
                          onClick={() => {
                            setModelMenuOpen(false);
                            props.onOpenSettings?.("keys");
                          }}
                        >
                          <KeyIcon class="h-3 w-3" />
                          <span>Add API Key</span>
                        </button>
                      </div>
                    }
                  >
                    <For each={filteredEnabledModels()}>
                      {(model) => {
                        const isSelected = () => model.id === activeModel()?.id;
                        return (
                          <button
                            type="button"
                            class="w-full px-2.5 py-1.5 text-left flex items-center justify-between hover:bg-[var(--color-bg-active)] cursor-pointer transition-colors"
                            classList={{
                              "bg-[var(--color-bg-active)]": isSelected(),
                            }}
                            onClick={() => {
                              setActiveModel(model.id);
                              setActiveModelSignal(model);
                              setModelMenuOpen(false);
                            }}
                          >
                            <div class="flex-1 min-w-0 pr-2 space-y-0.5">
                              <div class="flex items-center gap-1.5">
                                <span
                                  class="text-xs font-medium truncate"
                                  classList={{
                                    "text-[var(--color-accent)] font-semibold": isSelected(),
                                    "text-[var(--color-fg-primary)]": !isSelected(),
                                  }}
                                >
                                  {model.name}
                                </span>
                                <Show when={model.context}>
                                  <span class="text-[9px] font-mono px-1 py-0.2 rounded bg-[var(--color-bg-panel)] text-[var(--color-fg-muted)] border border-[var(--color-border-subtle)]">
                                    {model.context}
                                  </span>
                                </Show>
                              </div>
                              <div class="text-[10px] text-[var(--color-fg-muted)] font-mono truncate flex items-center gap-1">
                                <span class="uppercase text-[9px] px-1 rounded bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)]">
                                  {model.provider}
                                </span>
                                <span class="truncate">{model.id}</span>
                              </div>
                            </div>
                            <Show when={isSelected()}>
                              <CheckIcon class="h-3.5 w-3.5 text-[var(--color-accent)] shrink-0" />
                            </Show>
                          </button>
                        );
                      }}
                    </For>
                  </Show>
                </div>

                {/* Footer: Configure Models Link */}
                <div class="p-1.5 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)]">
                  <button
                    type="button"
                    class="w-full px-2 py-1 text-[11px] font-medium text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-active)] rounded flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    onClick={() => {
                      setModelMenuOpen(false);
                      props.onOpenSettings?.("models");
                    }}
                  >
                    <GearIcon class="h-3 w-3" />
                    Configure Models ({enabledModels().length} active)
                  </button>
                </div>
              </div>
            </Show>
          </div>

          <div class="flex items-center gap-2 text-[10px] text-[var(--color-fg-muted)]">
            <Show when={streamReducer.state().costUsd > 0}>
              <span class="font-mono text-[var(--color-accent)]">
                ${streamReducer.state().costUsd.toFixed(5)}
              </span>
            </Show>
            <span>Esc: Abort</span>
          </div>
        </div>
      </div>
    </div>
  );
}
