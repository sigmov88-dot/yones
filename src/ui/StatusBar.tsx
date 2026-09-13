import { Show } from "solid-js";
import { GitBranchIcon, ErrorIcon, WarningIcon, SunIcon, MoonIcon } from "./icons";

export interface StatusBarProps {
  gitBranch?: string;
  gitModifiedCount?: number;
  errorCount?: number;
  warningCount?: number;
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
        <div class="flex items-center gap-1.5 text-[var(--color-fg-secondary)]">
          <GitBranchIcon class="h-3 w-3 opacity-80" />
          <span>{props.gitBranch ?? "main"}</span>
          <Show when={(props.gitModifiedCount ?? 0) > 0}>
            <span class="text-[var(--color-warning)] font-medium">
              *{props.gitModifiedCount}
            </span>
          </Show>
        </div>

        <span class="opacity-20">|</span>

        <div class="flex items-center gap-1.5">
          <span class="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
          <span>Syntax</span>
          <span class="flex items-center gap-2 font-mono text-[10px]">
            <span class="text-[var(--color-danger)] font-medium flex items-center gap-1">
              <ErrorIcon class="h-3 w-3" />
              <span>{props.errorCount ?? 0}</span>
            </span>
            <span class="text-[var(--color-warning)] font-medium flex items-center gap-1">
              <WarningIcon class="h-3 w-3" />
              <span>{props.warningCount ?? 0}</span>
            </span>
          </span>
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
          class="hover:text-[var(--color-fg-primary)] cursor-pointer flex items-center gap-1"
          onClick={props.onToggleTheme}
          title="Toggle Dark/Light Theme"
        >
          <Show when={props.theme === "dark"} fallback={<MoonIcon class="h-3 w-3" />}>
            <SunIcon class="h-3 w-3" />
          </Show>
          <span>{props.theme === "dark" ? "Light" : "Dark"}</span>
        </button>
      </div>
    </footer>
  );
}
