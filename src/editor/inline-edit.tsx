import { createSignal, onMount, onCleanup, Show, For } from "solid-js";
import { streamLlm } from "../ai/provider";
import { createStreamReducer } from "../ai/stream-reducer";
import { parseSearchReplaceBlocks, generateUnifiedDiff, type DiffLine } from "../ai/edit-parser";

export interface InlineEditProps {
  selectedText: string;
  filePath: string;
  onApply: (replacement: string) => void;
  onClose: () => void;
}

export function InlineEdit(props: InlineEditProps) {
  const [prompt, setPrompt] = createSignal("");
  const [diffLines, setDiffLines] = createSignal<DiffLine[]>([]);
  const streamReducer = createStreamReducer();
  let inputRef!: HTMLInputElement;
  let abortController: AbortController | null = null;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (streamReducer.state().isStreaming) {
        abortController?.abort();
        streamReducer.abort();
      } else {
        props.onClose();
      }
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.stopPropagation();
      applyChanges();
    } else if (e.key === "Enter" && !e.shiftKey && !streamReducer.state().isStreaming) {
      e.preventDefault();
      runGeneration();
    }
  };

  const runGeneration = async () => {
    if (!prompt().trim()) return;

    abortController = new AbortController();
    streamReducer.start();
    setDiffLines([]);

    const systemPrompt =
      "You are an inline code modification agent. Produce precise search and replace blocks.\n" +
      "Format strictly:\n" +
      "<<<<<<< SEARCH\n[original exact snippet]\n=======\n[modified snippet]\n>>>>>>> REPLACE";

    const messages = [
      {
        role: "user" as const,
        content: `File: ${props.filePath}\nSelection:\n\`\`\`\n${props.selectedText}\n\`\`\`\nRequest: ${prompt()}`,
      },
    ];

    try {
      const stream = streamLlm(messages, [], {
        system: systemPrompt,
        signal: abortController.signal,
      });

      for await (const event of stream) {
        streamReducer.processEvent(event);
        if (event.type === "TextDelta") {
          const parsed = parseSearchReplaceBlocks(streamReducer.state().rawText);
          if (parsed.length > 0 && parsed[0].blocks.length > 0) {
            const replacement = parsed[0].blocks[0].replace;
            setDiffLines(generateUnifiedDiff(props.selectedText, replacement));
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") {
        console.error("Inline edit generation error:", err);
      }
    }
  };

  const applyChanges = () => {
    const parsed = parseSearchReplaceBlocks(streamReducer.state().rawText);
    if (parsed.length > 0 && parsed[0].blocks.length > 0) {
      props.onApply(parsed[0].blocks[0].replace);
    }
    props.onClose();
  };

  onMount(() => {
    inputRef?.focus();
  });

  onCleanup(() => {
    abortController?.abort();
    streamReducer.abort();
  });

  return (
    <div
      class="w-full max-w-2xl rounded-md border border-[var(--color-border)] bg-[var(--color-bg-raised)] p-3 text-[var(--color-fg-primary)] shadow-sm"
      onKeyDown={handleKeyDown}
    >
      <div class="flex items-center gap-2">
        <Show when={streamReducer.state().isStreaming}>
          <div class="h-2 w-2 rounded-full bg-[var(--color-accent)] animate-agent-working" />
        </Show>
        <input
          ref={inputRef}
          type="text"
          class="flex-1 bg-[var(--color-bg-panel)] px-2 py-1.5 text-sm rounded border border-[var(--color-border-subtle)] text-[var(--color-fg-primary)] placeholder-[var(--color-fg-muted)] outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent-ring)]"
          placeholder="Instruct edit (Enter to submit, Cmd+Enter to apply, Esc to cancel)..."
          value={prompt()}
          onInput={(e) => setPrompt(e.currentTarget.value)}
          disabled={streamReducer.state().isStreaming}
        />
        <Show when={!streamReducer.state().isStreaming && diffLines().length > 0}>
          <button
            type="button"
            class="px-2.5 py-1 text-xs font-medium rounded bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] active:bg-[var(--color-accent-press)] cursor-pointer"
            onClick={applyChanges}
          >
            Apply
          </button>
        </Show>
      </div>

      <Show when={diffLines().length > 0}>
        <div class="mt-3 max-h-60 overflow-y-auto rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-editor)] font-mono text-xs">
          <For each={diffLines()}>
            {(line) => (
              <div
                class="flex px-2 py-0.5"
                classList={{
                  "bg-[var(--color-success-bg)] text-[var(--color-success)] border-l-2 border-l-[var(--color-success)]":
                    line.type === "added",
                  "bg-[var(--color-danger-bg)] text-[var(--color-danger)] border-l-2 border-l-[var(--color-danger)]":
                    line.type === "removed",
                  "text-[var(--color-fg-secondary)]": line.type === "unchanged",
                }}
              >
                <span class="w-8 select-none text-right opacity-40 pr-2">
                  {line.type === "added" ? line.newLineNumber : line.oldLineNumber}
                </span>
                <span class="w-4 select-none text-center">
                  {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
                </span>
                <span class="flex-1 whitespace-pre">{line.content}</span>
              </div>
            )}
          </For>
        </div>
      </Show>

      <div class="mt-2 flex items-center justify-between text-[11px] text-[var(--color-fg-muted)]">
        <span>
          <Show
            when={streamReducer.state().isStreaming}
            fallback={<span>Esc: Dismiss &bull; Cmd+Enter: Apply</span>}
          >
            <span>Generating &bull; {streamReducer.state().tokensPerSec} tok/s &bull; Esc to abort</span>
          </Show>
        </span>
        <Show when={streamReducer.state().costUsd > 0}>
          <span>${streamReducer.state().costUsd.toFixed(5)}</span>
        </Show>
      </div>
    </div>
  );
}
