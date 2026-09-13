import { Show } from "solid-js";
import {
  GitBranchIcon,
  ErrorIcon,
  WarningIcon,
  SunIcon,
  MoonIcon,
  SparklesIcon,
} from "./icons";

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
  activeModelName?: string;
  typingLatencyMs?: number;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onOpenModelSettings?: () => void;
}

export function StatusBar(props: StatusBarProps) {
  return (
    <footer class="h-6 w-full px-3 flex items-center justify-between text-[11px] bg-[var(--color-bg-panel)] border-t border-[var(--color-border-subtle)] text-[var(--color-fg-muted)] select-none">
      {/* Left side: Git, Diagnostics */}
      <div class="flex items-center gap-2.5">
        <div class="flex items-center gap-1.5 text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors cursor-pointer">
          <GitBranchIcon class="h-3 w-3 opacity-80" />
          <span class="font-medium">{props.gitBranch ?? "main"}</span>
          <Show when={(props.gitModifiedCount ?? 0) > 0}>
            <span class="text-[var(--color-warning)] font-medium tabular-nums">
              *{props.gitModifiedCount}
            </span>
          </Show>
        </div>

        <span class="opacity-20">|</span>

        <div class="flex items-center gap-1.5">
          <span class="h-1.5 w-1.5 rounded-full bg-[var(--color-success)] shrink-0" />
          <span>Syntax</span>
          <span class="flex items-center gap-1.5 font-mono text-[10px] tabular-nums">
            <span
              class="flex items-center gap-0.5"
              classList={{
                "text-[var(--color-danger)] font-medium": (props.errorCount ?? 0) > 0,
                "text-[var(--color-fg-muted)]": (props.errorCount ?? 0) === 0,
              }}
            >
              <ErrorIcon class="h-3 w-3" />
              <span>{props.errorCount ?? 0}</span>
            </span>
            <span
              class="flex items-center gap-0.5"
              classList={{
                "text-[var(--color-warning)] font-medium": (props.warningCount ?? 0) > 0,
                "text-[var(--color-fg-muted)]": (props.warningCount ?? 0) === 0,
              }}
            >
              <WarningIcon class="h-3 w-3" />
              <span>{props.warningCount ?? 0}</span>
            </span>
          </span>
        </div>
      </div>

      {/* Right side: AI Model, Tokens, Latency, Line/Col, Encoding, Theme */}
      <div class="flex items-center gap-2.5">
        <Show when={props.activeModelName}>
          <button
            type="button"
            class="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-bg-active)] transition-colors cursor-pointer"
            onClick={props.onOpenModelSettings}
            title="Active AI Model - Click to configure"
          >
            <SparklesIcon class="h-3 w-3" />
            <span class="truncate max-w-[140px]">{props.activeModelName}</span>
          </button>
          <span class="opacity-20">|</span>
        </Show>

        <Show when={(props.tokensTotal ?? 0) > 0 || (props.sessionCostUsd ?? 0) > 0}>
          <div class="flex items-center gap-1 text-[var(--color-fg-secondary)] tabular-nums">
            <span>{props.tokensTotal ?? 0} tok</span>
            <span>&bull;</span>
            <span>${(props.sessionCostUsd ?? 0).toFixed(4)}</span>
          </div>
          <span class="opacity-20">|</span>
        </Show>

        <div class="tabular-nums" title="Cursor Line and Column">
          Ln {props.cursorLine ?? 1}, Col {props.cursorCol ?? 1}
        </div>

        <span class="opacity-20">|</span>

        <div title="File Encoding & Tab Size">UTF-8</div>

        <span class="opacity-20">|</span>

        <div>{props.language ?? "TypeScript"}</div>

        <span class="opacity-20">|</span>

        <div
          class="flex items-center gap-0.5 text-[10px] text-[var(--color-success)] font-mono tabular-nums"
          title="Yones Engine Typing Latency Benchmark"
        >
          <span>p99: {(props.typingLatencyMs ?? 0.007).toFixed(3)}ms</span>
          <span class="text-[10px]">⚡</span>
        </div>

        <span class="opacity-20">|</span>

        <button
          type="button"
          class="hover:text-[var(--color-fg-primary)] cursor-pointer flex items-center gap-1 px-1 py-0.5 rounded hover:bg-[var(--color-bg-active)] transition-colors"
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
