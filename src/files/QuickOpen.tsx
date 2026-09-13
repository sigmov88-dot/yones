import { createSignal, onMount, For, Show } from "solid-js";
import type { FileNode } from "./Tree";

export interface QuickOpenProps {
  files: FileNode[];
  onSelect: (path: string) => void;
  onClose: () => void;
}

export function QuickOpen(props: QuickOpenProps) {
  const [query, setQuery] = createSignal("");
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  let inputRef!: HTMLInputElement;

  const filteredFiles = () => {
    const q = query().toLowerCase().trim();
    const fileOnlyNodes = props.files.filter((f) => !f.isDir);
    if (!q) return fileOnlyNodes.slice(0, 12);

    return fileOnlyNodes
      .map((file) => {
        const pathLower = file.path.toLowerCase();
        const nameLower = file.name.toLowerCase();
        let score = 0;

        if (nameLower === q) score += 100;
        else if (nameLower.startsWith(q)) score += 50;
        else if (nameLower.includes(q)) score += 25;
        else if (pathLower.includes(q)) score += 10;

        return { file, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.file)
      .slice(0, 12);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const list = filteredFiles();
    if (e.key === "Escape") {
      e.preventDefault();
      props.onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (list.length > 0 ? (prev + 1) % list.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (list.length > 0 ? (prev - 1 + list.length) % list.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (list.length > 0) {
        const target = list[selectedIndex()];
        if (target) {
          props.onSelect(target.path);
          props.onClose();
        }
      }
    }
  };

  onMount(() => {
    inputRef?.focus();
  });

  return (
    <div
      class="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-[var(--color-overlay)]"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div
        class="w-full max-w-xl rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-raised)] shadow-2xl overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        <div class="p-2.5 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)]">
          <input
            ref={inputRef}
            type="text"
            placeholder="Type file name to open..."
            class="w-full bg-[var(--color-bg-editor)] px-3 py-2 text-sm rounded border border-[var(--color-border-subtle)] text-[var(--color-fg-primary)] placeholder-[var(--color-fg-muted)] outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent-ring)]"
            value={query()}
            onInput={(e) => {
              setQuery(e.currentTarget.value);
              setSelectedIndex(0);
            }}
          />
        </div>

        <div class="max-h-80 overflow-y-auto p-1 font-mono text-xs">
          <Show
            when={filteredFiles().length > 0}
            fallback={
              <div class="py-6 text-center text-xs text-[var(--color-fg-muted)]">
                No matching files found
              </div>
            }
          >
            <For each={filteredFiles()}>
              {(file, idx) => (
                <div
                  class="flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors select-none"
                  classList={{
                    "bg-[var(--color-bg-active)] text-[var(--color-accent)] font-medium":
                      selectedIndex() === idx(),
                    "text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-panel)]":
                      selectedIndex() !== idx(),
                  }}
                  onClick={() => {
                    props.onSelect(file.path);
                    props.onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx())}
                >
                  <div class="flex items-center gap-2 truncate">
                    <span class="text-[var(--color-fg-muted)]">•</span>
                    <span class="truncate font-semibold">{file.name}</span>
                  </div>
                  <span class="text-[11px] text-[var(--color-fg-muted)] truncate max-w-xs opacity-70">
                    {file.path}
                  </span>
                </div>
              )}
            </For>
          </Show>
        </div>

        <div class="px-3 py-1.5 bg-[var(--color-bg-panel)] border-t border-[var(--color-border-subtle)] flex items-center justify-between text-[10px] text-[var(--color-fg-muted)] select-none">
          <span>&uarr;&darr; to navigate &bull; Enter to select &bull; Esc to dismiss</span>
          <span>{filteredFiles().length} matches</span>
        </div>
      </div>
    </div>
  );
}
