import { createSignal, Show } from "solid-js";
import { VirtualList } from "./virtual-list";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  FileIcon,
  CloseIcon,
  SearchIcon,
} from "../ui/icons";

export interface FileNode {
  path: string;
  name: string;
  isDir: boolean;
  depth: number;
  expanded?: boolean;
}

export interface TreeProps {
  files: FileNode[];
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  onToggleDir: (path: string) => void;
}

function FileTypeBadge(props: { name: string }) {
  const ext = () => {
    const parts = props.name.split(".");
    return parts.length > 1 ? parts.pop()?.toLowerCase() : "";
  };

  const badge = () => {
    switch (ext()) {
      case "ts":
      case "tsx":
        return { text: "TS", color: "text-[#3178C6] bg-[#3178C6]/15 border-[#3178C6]/30" };
      case "js":
      case "jsx":
        return { text: "JS", color: "text-[#F7DF1E] bg-[#F7DF1E]/15 border-[#F7DF1E]/30" };
      case "rs":
        return { text: "RS", color: "text-[#DEA584] bg-[#DEA584]/15 border-[#DEA584]/30" };
      case "json":
        return { text: "{}", color: "text-[#CBCB41] bg-[#CBCB41]/15 border-[#CBCB41]/30" };
      case "css":
        return { text: "#", color: "text-[#42A5F5] bg-[#42A5F5]/15 border-[#42A5F5]/30" };
      case "md":
        return { text: "MD", color: "text-[#AB47BC] bg-[#AB47BC]/15 border-[#AB47BC]/30" };
      default:
        return null;
    }
  };

  return (
    <Show
      when={badge()}
      fallback={<FileIcon class="h-3.5 w-3.5 text-[var(--color-fg-muted)] shrink-0" />}
    >
      {(b) => (
        <span
          class={`h-3.5 px-1 rounded-[3px] border font-mono text-[9px] font-bold flex items-center justify-center shrink-0 leading-none ${b().color}`}
        >
          {b().text}
        </span>
      )}
    </Show>
  );
}

export function Tree(props: TreeProps) {
  const [filter, setFilter] = createSignal("");

  const filteredFiles = () => {
    const q = filter().toLowerCase().trim();
    if (!q) return props.files;
    return props.files.filter((f) => f.name.toLowerCase().includes(q));
  };

  return (
    <div class="h-full w-full flex flex-col bg-[var(--color-bg-panel)] border-r border-[var(--color-border-subtle)] select-none">
      {/* Search Header */}
      <div class="p-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)]">
        <div class="relative flex items-center">
          <SearchIcon class="h-3 w-3 text-[var(--color-fg-muted)] absolute left-2 pointer-events-none opacity-60" />
          <input
            type="text"
            placeholder="Filter files..."
            class="w-full pl-7 pr-6 py-1 text-xs rounded-md bg-[var(--color-bg-editor)] border border-[var(--color-border-subtle)] text-[var(--color-fg-primary)] placeholder-[var(--color-fg-muted)] outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent-ring)] transition-all"
            value={filter()}
            onInput={(e) => setFilter(e.currentTarget.value)}
          />
          <Show when={filter()}>
            <button
              type="button"
              class="absolute right-1.5 p-0.5 text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] cursor-pointer"
              onClick={() => setFilter("")}
            >
              <CloseIcon class="h-3 w-3" />
            </button>
          </Show>
        </div>
      </div>

      <div class="flex-1 overflow-hidden">
        <Show
          when={filteredFiles().length > 0}
          fallback={
            <div class="p-6 text-xs text-[var(--color-fg-muted)] text-center space-y-1">
              <div>No matching files</div>
              <Show when={filter()}>
                <button
                  type="button"
                  class="text-[11px] text-[var(--color-accent)] hover:underline cursor-pointer"
                  onClick={() => setFilter("")}
                >
                  Clear filter
                </button>
              </Show>
            </div>
          }
        >
          <VirtualList
            items={filteredFiles()}
            itemHeight={26}
            class="h-full w-full"
            renderItem={(node) => {
              const isActive = () => props.activeFile === node.path;
              return (
                <div
                  class="flex items-center h-[26px] px-2 text-xs cursor-pointer select-none truncate transition-colors group"
                  classList={{
                    "bg-[var(--color-bg-active)] text-[var(--color-fg-primary)] font-medium border-l-2 border-[var(--color-accent)]":
                      isActive(),
                    "text-[var(--color-fg-secondary)] hover:bg-[var(--color-bg-raised)] hover:text-[var(--color-fg-primary)] border-l-2 border-transparent":
                      !isActive(),
                  }}
                  style={{ "padding-left": `${node.depth * 14 + 8}px` }}
                  onClick={() => {
                    if (node.isDir) {
                      props.onToggleDir(node.path);
                    } else {
                      props.onSelectFile(node.path);
                    }
                  }}
                >
                  <span class="mr-1 opacity-70 flex items-center shrink-0">
                    <Show when={node.isDir} fallback={<span class="w-3" />}>
                      <Show when={node.expanded} fallback={<ChevronRightIcon class="h-3 w-3" />}>
                        <ChevronDownIcon class="h-3 w-3" />
                      </Show>
                    </Show>
                  </span>

                  <span class="mr-1.5 flex items-center shrink-0">
                    <Show
                      when={node.isDir}
                      fallback={<FileTypeBadge name={node.name} />}
                    >
                      <Show
                        when={node.expanded}
                        fallback={<FolderIcon class="h-3.5 w-3.5 text-[var(--color-accent)]" />}
                      >
                        <FolderOpenIcon class="h-3.5 w-3.5 text-[var(--color-accent)]" />
                      </Show>
                    </Show>
                  </span>

                  <span class="truncate">{node.name}</span>
                </div>
              );
            }}
          />
        </Show>
      </div>
    </div>
  );
}
