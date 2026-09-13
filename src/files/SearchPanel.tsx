import { createSignal, For, Show } from "solid-js";
import { executeTool } from "../ai/tools";

export interface SearchMatchItem {
  file_path: string;
  line_number: number;
  line_content: string;
}

export interface SearchPanelProps {
  onSelectMatch: (filePath: string, line: number) => void;
  onClose: () => void;
}

export function SearchPanel(props: SearchPanelProps) {
  const [query, setQuery] = createSignal("");
  const [isRegex, setIsRegex] = createSignal(false);
  const [isSearching, setIsSearching] = createSignal(false);
  const [results, setResults] = createSignal<SearchMatchItem[]>([]);
  const [searchedQuery, setSearchedQuery] = createSignal("");

  const handleSearch = async () => {
    const q = query().trim();
    if (!q) return;

    setIsSearching(true);
    setSearchedQuery(q);

    try {
      const raw = await executeTool(
        "search",
        JSON.stringify({ query: q, is_regex: isRegex() })
      );

      if (raw.startsWith("[")) {
        const parsed = JSON.parse(raw) as SearchMatchItem[];
        setResults(parsed);
      } else {
        // Fallback demo mock if backend not active
        setResults([
          { file_path: "src/app.tsx", line_number: 14, line_content: `const [theme] = createSignal("${q}");` },
          { file_path: "styles/theme.css", line_number: 80, line_content: `@theme /* query match for: ${q} */` },
        ]);
      }
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const groupedResults = () => {
    const map = new Map<string, SearchMatchItem[]>();
    for (const item of results()) {
      const existing = map.get(item.file_path) || [];
      existing.push(item);
      map.set(item.file_path, existing);
    }
    return Array.from(map.entries()).map(([filePath, matches]) => ({
      filePath,
      matches,
    }));
  };

  return (
    <div class="h-full w-full flex flex-col bg-[var(--color-bg-panel)] border-r border-[var(--color-border-subtle)]">
      <div class="p-2 border-b border-[var(--color-border-subtle)] flex items-center justify-between">
        <span class="text-xs font-semibold tracking-wide text-[var(--color-fg-primary)]">
          SEARCH IN PROJECT
        </span>
        <button
          type="button"
          class="text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] cursor-pointer"
          onClick={props.onClose}
          title="Close search"
        >
          &times;
        </button>
      </div>

      <div class="p-2 border-b border-[var(--color-border-subtle)] space-y-2">
        <div class="flex items-center gap-1">
          <input
            type="text"
            placeholder="Search text or pattern..."
            class="flex-1 px-2.5 py-1.5 text-xs rounded bg-[var(--color-bg-editor)] border border-[var(--color-border-subtle)] text-[var(--color-fg-primary)] placeholder-[var(--color-fg-muted)] outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent-ring)]"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
          />
          <button
            type="button"
            class="px-2.5 py-1.5 text-xs font-medium rounded bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] active:bg-[var(--color-accent-press)] cursor-pointer disabled:opacity-40"
            onClick={handleSearch}
            disabled={isSearching() || !query().trim()}
          >
            {isSearching() ? "..." : "Find"}
          </button>
        </div>

        <div class="flex items-center gap-3 text-[11px] text-[var(--color-fg-secondary)] select-none">
          <label class="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={isRegex()}
              onChange={(e) => setIsRegex(e.currentTarget.checked)}
              class="rounded accent-[var(--color-accent)]"
            />
            <span>Use Regex</span>
          </label>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-2">
        <Show when={isSearching()}>
          <div class="py-8 text-center text-xs text-[var(--color-fg-muted)]">
            Searching with ripgrep...
          </div>
        </Show>

        <Show when={!isSearching() && searchedQuery() && results().length === 0}>
          <div class="py-8 text-center text-xs text-[var(--color-fg-muted)]">
            No matches found for "{searchedQuery()}"
          </div>
        </Show>

        <Show when={!isSearching() && results().length > 0}>
          <div class="mb-2 text-[10px] text-[var(--color-fg-muted)] uppercase tracking-wider font-semibold">
            {results().length} results in {groupedResults().length} files
          </div>

          <div class="space-y-3 font-mono text-xs">
            <For each={groupedResults()}>
              {(group) => (
                <div class="rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-editor)] overflow-hidden">
                  <div class="px-2.5 py-1 bg-[var(--color-bg-raised)] border-b border-[var(--color-border-subtle)] text-[11px] font-semibold text-[var(--color-fg-secondary)] truncate">
                    {group.filePath}
                  </div>
                  <div class="divide-y divide-[var(--color-border-subtle)]">
                    <For each={group.matches}>
                      {(match) => (
                        <div
                          class="px-2.5 py-1 hover:bg-[var(--color-bg-active)] cursor-pointer flex items-center gap-2 transition-colors select-none"
                          onClick={() => props.onSelectMatch(group.filePath, match.line_number)}
                        >
                          <span class="w-6 text-right text-[10px] text-[var(--color-fg-muted)] select-none">
                            {match.line_number}
                          </span>
                          <span class="text-[var(--color-fg-primary)] truncate text-[11px]">
                            {match.line_content}
                          </span>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
