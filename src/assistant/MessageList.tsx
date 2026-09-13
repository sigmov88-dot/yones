import { For, Show } from "solid-js";
import { DiffPreview } from "./DiffPreview";
import type { DiffLine } from "../ai/edit-parser";

export interface ChatEntry {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolCalls?: { id: string; name: string; args: string; status: "running" | "done" }[];
  filePatches?: { filePath: string; diffLines: DiffLine[] }[];
  txId?: string;
  applied?: boolean;
}

export interface MessageListProps {
  messages: ChatEntry[];
  onApplyPatches?: (entryIndex: number) => void;
  onRevertPatches?: (entryIndex: number) => void;
}

export function MessageList(props: MessageListProps) {
  let listRef!: HTMLDivElement;

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
            <div class="mb-1 text-[10px] text-[var(--color-fg-muted)] font-medium">
              {msg.role === "user" ? "You" : "Yones Agent"}
            </div>

            <div
              class="max-w-[92%] rounded p-2.5 leading-relaxed"
              classList={{
                "bg-[var(--color-bg-active)] text-[var(--color-fg-primary)]": msg.role === "user",
                "bg-[var(--color-bg-raised)] text-[var(--color-fg-primary)] border border-[var(--color-border-subtle)] w-full":
                  msg.role === "assistant",
              }}
            >
              <div class="whitespace-pre-wrap">{msg.text}</div>

              <Show when={msg.toolCalls && msg.toolCalls.length > 0}>
                <div class="mt-2 space-y-1">
                  <For each={msg.toolCalls}>
                    {(tool) => (
                      <div class="flex items-center gap-2 font-mono text-[11px] text-[var(--color-fg-muted)] bg-[var(--color-bg-editor)] px-2 py-1 rounded border border-[var(--color-border-subtle)]">
                        <span
                          class="h-1.5 w-1.5 rounded-full"
                          classList={{
                            "bg-[var(--color-accent)] animate-agent-working": tool.status === "running",
                            "bg-[var(--color-success)]": tool.status === "done",
                          }}
                        />
                        <span class="font-medium text-[var(--color-fg-secondary)]">{tool.name}</span>
                        <span class="truncate max-w-[200px] opacity-70">{tool.args}</span>
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              <Show when={msg.filePatches && msg.filePatches.length > 0}>
                <div class="mt-3">
                  <For each={msg.filePatches}>
                    {(patch) => (
                      <DiffPreview filePath={patch.filePath} diffLines={patch.diffLines} />
                    )}
                  </For>

                  <div class="mt-2 flex items-center justify-end gap-2">
                    <Show
                      when={msg.applied}
                      fallback={
                        <button
                          type="button"
                          class="px-3 py-1 text-xs font-medium rounded bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] active:bg-[var(--color-accent-press)] cursor-pointer"
                          onClick={() => props.onApplyPatches?.(idx())}
                        >
                          Apply All Changes
                        </button>
                      }
                    >
                      <span class="text-[11px] text-[var(--color-success)] flex items-center gap-1 font-medium">
                        <span>&#10003;</span> Applied
                      </span>
                      <button
                        type="button"
                        class="px-2.5 py-1 text-xs font-medium rounded bg-[var(--color-bg-panel)] text-[var(--color-fg-secondary)] border border-[var(--color-border)] hover:bg-[var(--color-bg-active)] hover:text-[var(--color-fg-primary)] cursor-pointer"
                        onClick={() => props.onRevertPatches?.(idx())}
                      >
                        Revert Step
                      </button>
                    </Show>
                  </div>
                </div>
              </Show>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
