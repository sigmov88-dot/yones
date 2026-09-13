import { Show } from "solid-js";

export interface StatusBarProps {
  gitBranch?: string;
  gitModifiedCount?: number;
  language?: string;
  cursorLine?: number;
  cursorCol?: number;
  tokensTotal?: number;
  sessionCostUsd?: number;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

export function StatusBar(props: StatusBarProps) {
  return (
    <footer class="h-6 w-full px-3 flex items-center justify-between text-[11px] bg-[var(--color-bg-panel)] border-t border-[var(--color-border-subtle)] text-[var(--color-fg-muted)] select-none">
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1 text-[var(--color-fg-secondary)]">
          <span class="font-mono text-[10px]">⎇</span>
          <span>{props.gitBranch ?? "main"}</span>
          <Show when={(props.gitModifiedCount ?? 0) > 0}>
            <span class="text-[var(--color-warning)] font-medium">
              *{props.gitModifiedCount}
            </span>
          </Show>
        </div>

        <span class="opacity-20">|</span>

        <div class="flex items-center gap-1">
          <span class="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
          <span>LSP: Connected</span>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <Show when={(props.tokensTotal ?? 0) > 0 || (props.sessionCostUsd ?? 0) > 0}>
          <div class="flex items-center gap-1.5 text-[var(--color-fg-secondary)]">
            <span>Tokens: {props.tokensTotal ?? 0}</span>
            <span>&bull;</span>
            <span>${(props.sessionCostUsd ?? 0).toFixed(4)}</span>
          </div>
          <span class="opacity-20">|</span>
        </Show>

        <div>
          Ln {props.cursorLine ?? 1}, Col {props.cursorCol ?? 1}
        </div>

        <span class="opacity-20">|</span>

        <div>{props.language ?? "TypeScript"}</div>

        <span class="opacity-20">|</span>

        <button
          type="button"
          class="hover:text-[var(--color-fg-primary)] cursor-pointer"
          onClick={props.onToggleTheme}
          title="Toggle Dark/Light Theme"
        >
          {props.theme === "dark" ? "☀ Light" : "☾ Dark"}
        </button>
      </div>
    </footer>
  );
}
