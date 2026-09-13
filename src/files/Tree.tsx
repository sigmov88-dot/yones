import { createSignal, Show } from "solid-js";
import { VirtualList } from "./virtual-list";
import { ChevronDownIcon, ChevronRightIcon, FolderIcon, FolderOpenIcon, FileIcon } from "../ui/icons";

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

export function Tree(props: TreeProps) {
  const [filter, setFilter] = createSignal("");

  const filteredFiles = () => {
    const q = filter().toLowerCase().trim();
    if (!q) return props.files;
    return props.files.filter((f) => f.name.toLowerCase().includes(q));
  };

  return (
    <div class="h-full w-full flex flex-col bg-[var(--color-bg-panel)] border-r border-[var(--color-border-subtle)]">
      <div class="p-2 border-b border-[var(--color-border-subtle)]">
        <input
          type="text"
          placeholder="Search files (Cmd+P)..."
          class="w-full px-2 py-1 text-xs rounded bg-[var(--color-bg-editor)] border border-[var(--color-border-subtle)] text-[var(--color-fg-primary)] placeholder-[var(--color-fg-muted)] outline-none focus:border-[var(--color-accent)]"
          value={filter()}
          onInput={(e) => setFilter(e.currentTarget.value)}
        />
      </div>

      <div class="flex-1 overflow-hidden">
        <Show
          when={filteredFiles().length > 0}
          fallback={
            <div class="p-4 text-xs text-[var(--color-fg-muted)] text-center">
              No files found
            </div>
          }
        >
          <VirtualList
            items={filteredFiles()}
            itemHeight={24}
            class="h-full w-full"
            renderItem={(node) => (
              <div
                class="flex items-center h-6 px-2 text-xs cursor-pointer select-none truncate hover:bg-[var(--color-bg-raised)] transition-colors"
                classList={{
                  "bg-[var(--color-bg-active)] text-[var(--color-accent)] font-medium":
                    props.activeFile === node.path,
                  "text-[var(--color-fg-primary)]": props.activeFile !== node.path,
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
                <span class="mr-1 opacity-70 flex items-center">
                  <Show
                    when={node.isDir}
                    fallback={<span class="w-3" />}
                  >
                    <Show
                      when={node.expanded}
                      fallback={<ChevronRightIcon class="h-3 w-3" />}
                    >
                      <ChevronDownIcon class="h-3 w-3" />
                    </Show>
                  </Show>
                </span>
                <span class="mr-1.5 opacity-80 flex items-center">
                  <Show
                    when={node.isDir}
                    fallback={<FileIcon class="h-3.5 w-3.5 text-[var(--color-fg-muted)]" />}
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
            )}
          />
        </Show>
      </div>
    </div>
  );
}
