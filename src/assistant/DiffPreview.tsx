import { For } from "solid-js";
import type { DiffLine } from "../ai/edit-parser";

export interface DiffPreviewProps {
  filePath: string;
  diffLines: DiffLine[];
}

export function DiffPreview(props: DiffPreviewProps) {
  return (
    <div class="my-2 rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-editor)] font-mono text-xs overflow-hidden">
      <div class="px-3 py-1 bg-[var(--color-bg-raised)] border-b border-[var(--color-border-subtle)] text-[11px] text-[var(--color-fg-secondary)] flex items-center justify-between">
        <span class="font-medium">{props.filePath}</span>
        <span class="text-[10px] text-[var(--color-fg-muted)]">
          +{props.diffLines.filter((l) => l.type === "added").length} / -
          {props.diffLines.filter((l) => l.type === "removed").length}
        </span>
      </div>

      <div class="max-h-60 overflow-y-auto">
        <For each={props.diffLines}>
          {(line) => (
            <div
              class="flex px-2 py-0.5 leading-relaxed"
              classList={{
                "bg-[var(--color-success-bg)] text-[var(--color-success)] border-l-2 border-l-[var(--color-success)]":
                  line.type === "added",
                "bg-[var(--color-danger-bg)] text-[var(--color-danger)] border-l-2 border-l-[var(--color-danger)]":
                  line.type === "removed",
                "text-[var(--color-fg-secondary)]": line.type === "unchanged",
              }}
            >
              <span class="w-8 select-none text-right opacity-30 pr-2">
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
    </div>
  );
}
