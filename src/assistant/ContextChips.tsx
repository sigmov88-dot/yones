import { For } from "solid-js";
import { CloseIcon } from "../ui/icons";

export interface ContextChipsProps {
  files: string[];
  onRemove: (file: string) => void;
}

export function ContextChips(props: ContextChipsProps) {
  return (
    <div class="flex flex-wrap gap-1.5 py-1 px-2">
      <For each={props.files}>
        {(file) => (
          <div class="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded bg-[var(--color-bg-raised)] border border-[var(--color-border)] text-[var(--color-fg-secondary)]">
            <span class="truncate max-w-[160px] font-mono text-[11px]">{file}</span>
            <button
              type="button"
              class="text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] cursor-pointer leading-none"
              onClick={() => props.onRemove(file)}
              title="Remove context"
            >
              <CloseIcon class="h-3 w-3" />
            </button>
          </div>
        )}
      </For>
    </div>
  );
}
