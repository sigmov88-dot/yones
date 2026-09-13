import { For, Show, createSignal, createEffect } from "solid-js";
import { DiffPreview } from "./DiffPreview";
import {
  CheckIcon,
  UndoIcon,
  BrainIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  WarningIcon,
  KeyIcon,
  RotateCwIcon,
  SparklesIcon,
} from "../ui/icons";
import type { DiffLine } from "../ai/edit-parser";

export interface ChatEntry {
  id: string;
  role: "user" | "assistant";
  text: string;
  thinking?: string;
  isThinking?: boolean;
  thinkingDurationMs?: number;
  error?: string;
  toolCalls?: { id: string; name: string; args: string; status: "running" | "done" }[];
  filePatches?: { filePath: string; diffLines: DiffLine[] }[];
  txId?: string;
  applied?: boolean;
}

export interface MessageListProps {
  messages: ChatEntry[];
  onApplyPatches?: (entryIndex: number) => void;
  onRevertPatches?: (entryIndex: number) => void;
  onOpenSettings?: (tab?: "keys" | "models") => void;
  onRetry?: (entryIndex: number) => void;
  onSelectPrompt?: (prompt: string) => void;
}

/**
 * Cursor/ChatGPT-style collapsible Thinking Process Accordion
 */
function ThinkingAccordion(props: {
  thinking: string;
  isThinking?: boolean;
  durationMs?: number;
}) {
  const [isOpen, setIsOpen] = createSignal(props.isThinking ?? false);
  let scrollContainer!: HTMLDivElement;

  // Automatically keep open while thinking is streaming
  createEffect(() => {
    if (props.isThinking) {
      setIsOpen(true);
    }
  });

  // Auto-scroll thinking output as it streams
  createEffect(() => {
    if (props.thinking && isOpen() && scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  });

  const durationText = () => {
    const ms = props.durationMs ?? 0;
    if (ms <= 0) return "";
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div class="mb-2.5 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-editor)]/40 overflow-hidden text-xs">
      {/* Header Bar */}
      <button
        type="button"
        class="w-full px-2.5 py-1.5 flex items-center justify-between hover:bg-[var(--color-bg-active)] transition-colors cursor-pointer text-left select-none"
        onClick={() => setIsOpen((v) => !v)}
      >
        <div class="flex items-center gap-1.5">
          <BrainIcon
            class={
              props.isThinking
                ? "h-3.5 w-3.5 text-[var(--color-accent)] animate-pulse"
                : "h-3.5 w-3.5 text-[var(--color-fg-muted)]"
            }
          />
          <span
            class="font-mono text-[11px] font-medium"
            classList={{
              "text-[var(--color-accent)]": props.isThinking,
              "text-[var(--color-fg-muted)]": !props.isThinking,
            }}
          >
            {props.isThinking
              ? "Thinking..."
              : durationText()
              ? `Thought for ${durationText()}`
              : "Thought process"}
          </span>
          <Show when={props.isThinking}>
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] animate-ping" />
          </Show>
        </div>

        <div class="flex items-center gap-1 text-[var(--color-fg-muted)]">
          <span class="text-[10px] font-mono opacity-70">
            {isOpen() ? "Hide" : "Show"}
          </span>
          <Show
            when={isOpen()}
            fallback={<ChevronRightIcon class="h-3 w-3 opacity-60" />}
          >
            <ChevronDownIcon class="h-3 w-3 opacity-60" />
          </Show>
        </div>
      </button>

      {/* Expanded Thinking Body */}
      <Show when={isOpen()}>
        <div
          ref={scrollContainer}
          class="p-2.5 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)]/50 font-mono text-[11px] leading-relaxed text-[var(--color-fg-secondary)] max-h-60 overflow-y-auto whitespace-pre-wrap select-text"
        >
          {props.thinking || (
            <span class="italic text-[var(--color-fg-muted)]">
              Analyzing context and formulating plan...
            </span>
          )}
        </div>
      </Show>
    </div>
  );
}

/**
 * Render assistant text with clean code block cards and copy button
 */
function FormattedAssistantText(props: { text: string }) {
  const [copiedIndex, setCopiedIndex] = createSignal<number | null>(null);

  const copyCode = async (code: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedIndex(idx);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // ignore
    }
  };

  const segments = () => {
    const raw = props.text;
    if (!raw) return [];

    const regex = /```(\w+)?\n([\s\S]*?)```/g;
    const parts: { type: "text" | "code"; content: string; language?: string }[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(raw)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: "text", content: raw.slice(lastIndex, match.index) });
      }
      parts.push({
        type: "code",
        language: match[1] || "code",
        content: match[2].trimEnd(),
      });
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < raw.length) {
      parts.push({ type: "text", content: raw.slice(lastIndex) });
    }

    return parts;
  };

  return (
    <div class="space-y-2.5 leading-relaxed text-[12.5px]">
      <For each={segments()}>
        {(seg, idx) => (
          <Show
            when={seg.type === "code"}
            fallback={<div class="whitespace-pre-wrap">{seg.content}</div>}
          >
            <div class="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-editor)] overflow-hidden my-2 font-mono text-xs">
              <div class="flex items-center justify-between px-3 py-1.5 bg-[var(--color-bg-panel)] border-b border-[var(--color-border-subtle)] text-[11px] text-[var(--color-fg-muted)]">
                <span class="font-medium text-[var(--color-fg-secondary)]">
                  {seg.language}
                </span>
                <button
                  type="button"
                  class="flex items-center gap-1 hover:text-[var(--color-fg-primary)] transition-colors cursor-pointer px-1.5 py-0.5 rounded hover:bg-[var(--color-bg-active)]"
                  onClick={() => copyCode(seg.content, idx())}
                >
                  <Show
                    when={copiedIndex() === idx()}
                    fallback={
                      <>
                        <CopyIcon class="h-3 w-3" />
                        <span>Copy</span>
                      </>
                    }
                  >
                    <CheckIcon class="h-3 w-3 text-[var(--color-success)]" />
                    <span class="text-[var(--color-success)] font-medium">Copied!</span>
                  </Show>
                </button>
              </div>
              <pre class="p-3 overflow-x-auto text-[11.5px] leading-relaxed text-[var(--color-fg-primary)]">
                <code>{seg.content}</code>
              </pre>
            </div>
          </Show>
        )}
      </For>
    </div>
  );
}

export function MessageList(props: MessageListProps) {
  let listRef!: HTMLDivElement;

  createEffect(() => {
    // Scroll to bottom as new messages arrive or stream updates
    if (props.messages.length > 0 && listRef) {
      listRef.scrollTop = listRef.scrollHeight;
    }
  });

  const isWelcomeOnly = () =>
    props.messages.length === 1 && props.messages[0].id === "welcome";

  const starterPrompts = [
    {
      title: "Explain project structure",
      prompt: "Explain the structure of this project and where the core features are located.",
    },
    {
      title: "Find code issues",
      prompt: "Analyze the current workspace for potential bugs, syntax issues, and improvements.",
    },
    {
      title: "Generate tests",
      prompt: "Write unit tests for the key business logic in the open files.",
    },
  ];

  return (
    <div ref={listRef} class="flex-1 overflow-y-auto p-3 space-y-4">
      <For each={props.messages}>
        {(msg, idx) => (
          <div
            class="flex flex-col text-xs"
            classList={{
              "items-end": msg.role === "user",
              "items-start": msg.role === "assistant",
            }}
          >
            <div class="mb-1 text-[10px] text-[var(--color-fg-muted)] font-medium flex items-center gap-1.5">
              <span>{msg.role === "user" ? "You" : "Yones Agent"}</span>
              <Show when={msg.isThinking}>
                <span class="text-[9px] text-[var(--color-accent)] animate-pulse">
                  ● thinking
                </span>
              </Show>
            </div>

            <div
              class="max-w-[94%] rounded-xl p-3 leading-relaxed"
              classList={{
                "bg-[var(--color-bg-active)] text-[var(--color-fg-primary)] border border-[var(--color-border-subtle)]":
                  msg.role === "user",
                "bg-[var(--color-bg-raised)] text-[var(--color-fg-primary)] border border-[var(--color-border-subtle)] w-full shadow-sm":
                  msg.role === "assistant",
              }}
            >
              {/* Collapsible Thinking Accordion */}
              <Show when={msg.thinking || msg.isThinking}>
                <ThinkingAccordion
                  thinking={msg.thinking || ""}
                  isThinking={msg.isThinking}
                  durationMs={msg.thinkingDurationMs}
                />
              </Show>

              {/* Message Content */}
              <Show
                when={msg.text}
                fallback={
                  <Show when={!msg.error && !msg.thinking && !msg.isThinking}>
                    <div class="text-[var(--color-fg-muted)] italic text-xs flex items-center gap-2">
                      <span class="h-2 w-2 rounded-full bg-[var(--color-accent)] animate-ping" />
                      <span>Connecting to model and starting generation...</span>
                    </div>
                  </Show>
                }
              >
                <FormattedAssistantText text={msg.text} />
              </Show>

              {/* Error Alert Card */}
              <Show when={msg.error}>
                <div class="mt-2.5 p-3 rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 text-xs">
                  <div class="flex items-start gap-2">
                    <WarningIcon class="h-4 w-4 text-[var(--color-danger)] shrink-0 mt-0.5" />
                    <div class="flex-1 min-w-0">
                      <div class="font-semibold text-[var(--color-danger)]">
                        Model Execution Error
                      </div>
                      <div class="text-[var(--color-fg-primary)] mt-1 font-mono text-[11px] leading-relaxed break-words">
                        {msg.error}
                      </div>

                      <div class="mt-2.5 flex items-center gap-2 flex-wrap">
                        <Show
                          when={
                            msg.error?.toLowerCase().includes("api key") ||
                            msg.error?.toLowerCase().includes("not configured") ||
                            msg.error?.toLowerCase().includes("401") ||
                            msg.error?.toLowerCase().includes("auth")
                          }
                        >
                          <button
                            type="button"
                            class="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--color-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-accent-hover)] cursor-pointer transition-colors shadow-sm"
                            onClick={() => props.onOpenSettings?.("keys")}
                          >
                            <KeyIcon class="h-3 w-3" />
                            <span>Add API Key in Settings</span>
                          </button>
                        </Show>

                        <Show when={props.onRetry}>
                          <button
                            type="button"
                            class="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--color-bg-panel)] text-[var(--color-fg-secondary)] border border-[var(--color-border)] hover:bg-[var(--color-bg-active)] hover:text-[var(--color-fg-primary)] text-[11px] font-medium cursor-pointer transition-colors"
                            onClick={() => props.onRetry?.(idx())}
                          >
                            <RotateCwIcon class="h-3 w-3" />
                            <span>Retry</span>
                          </button>
                        </Show>
                      </div>
                    </div>
                  </div>
                </div>
              </Show>

              {/* Tool Execution Badges */}
              <Show when={msg.toolCalls && msg.toolCalls.length > 0}>
                <div class="mt-2.5 space-y-1">
                  <For each={msg.toolCalls}>
                    {(tool) => (
                      <div class="flex items-center gap-2 font-mono text-[11px] text-[var(--color-fg-muted)] bg-[var(--color-bg-editor)] px-2.5 py-1.5 rounded border border-[var(--color-border-subtle)]">
                        <span
                          class="h-1.5 w-1.5 rounded-full"
                          classList={{
                            "bg-[var(--color-accent)] animate-agent-working":
                              tool.status === "running",
                            "bg-[var(--color-success)]": tool.status === "done",
                          }}
                        />
                        <span class="font-medium text-[var(--color-fg-secondary)]">
                          {tool.name}
                        </span>
                        <span class="truncate max-w-[200px] opacity-70">
                          {tool.args}
                        </span>
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              {/* Multi-File Code Patches & Apply/Revert buttons */}
              <Show when={msg.filePatches && msg.filePatches.length > 0}>
                <div class="mt-3">
                  <For each={msg.filePatches}>
                    {(patch) => (
                      <DiffPreview
                        filePath={patch.filePath}
                        diffLines={patch.diffLines}
                      />
                    )}
                  </For>

                  <div class="mt-2 flex items-center justify-end gap-2">
                    <Show
                      when={msg.applied}
                      fallback={
                        <button
                          type="button"
                          class="px-3 py-1 text-xs font-medium rounded bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] active:bg-[var(--color-accent-press)] cursor-pointer transition-colors"
                          onClick={() => props.onApplyPatches?.(idx())}
                        >
                          Apply All Changes
                        </button>
                      }
                    >
                      <span class="text-[11px] text-[var(--color-success)] flex items-center gap-1 font-medium">
                        <CheckIcon class="h-3.5 w-3.5" />
                        <span>Applied</span>
                      </span>
                      <button
                        type="button"
                        class="px-2.5 py-1 text-xs font-medium rounded bg-[var(--color-bg-panel)] text-[var(--color-fg-secondary)] border border-[var(--color-border)] hover:bg-[var(--color-bg-active)] hover:text-[var(--color-fg-primary)] cursor-pointer flex items-center gap-1 transition-colors"
                        onClick={() => props.onRevertPatches?.(idx())}
                      >
                        <UndoIcon class="h-3 w-3 opacity-80" />
                        <span>Revert Step</span>
                      </button>
                    </Show>
                  </div>
                </div>
              </Show>
            </div>
          </div>
        )}
      </For>

      {/* Quick starter suggestions if only welcome message exists */}
      <Show when={isWelcomeOnly()}>
        <div class="pt-2 space-y-2">
          <div class="text-[11px] font-medium text-[var(--color-fg-muted)] flex items-center gap-1.5">
            <SparklesIcon class="h-3 w-3 text-[var(--color-accent)]" />
            <span>Suggested prompts</span>
          </div>
          <div class="grid grid-cols-1 gap-1.5">
            <For each={starterPrompts}>
              {(item) => (
                <button
                  type="button"
                  class="text-left px-3 py-2 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] hover:bg-[var(--color-bg-active)] hover:border-[var(--color-accent)]/50 transition-all cursor-pointer group"
                  onClick={() => props.onSelectPrompt?.(item.prompt)}
                >
                  <div class="text-xs font-medium text-[var(--color-fg-primary)] group-hover:text-[var(--color-accent)]">
                    {item.title}
                  </div>
                  <div class="text-[11px] text-[var(--color-fg-muted)] truncate">
                    {item.prompt}
                  </div>
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}
