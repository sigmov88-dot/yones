import { createSignal, onMount, onCleanup, Show, For } from "solid-js";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { Editor } from "./editor/Editor";
import { Tree, type FileNode } from "./files/Tree";
import { AssistantPanel } from "./assistant/Panel";
import { StatusBar } from "./ui/StatusBar";

interface OpenTab {
  path: string;
  name: string;
  content: string;
  isModified: boolean;
}

export function App() {
  const [theme, setTheme] = createSignal<"dark" | "light">("dark");
  const [projectRoot, setProjectRoot] = createSignal<string | null>(null);
  const [files, setFiles] = createSignal<FileNode[]>([]);
  const [tabs, setTabs] = createSignal<OpenTab[]>([]);
  const [activeTabPath, setActiveTabPath] = createSignal<string | null>(null);
  const [assistantOpen, setAssistantOpen] = createSignal(false);
  const [gitBranch] = createSignal("main");
  const [sessionCost] = createSignal(0);
  const [totalTokens] = createSignal(0);

  const toggleTheme = () => {
    const next = theme() === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
  };

  const handleOpenFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Open Project Folder",
      });

      if (selected && typeof selected === "string") {
        setProjectRoot(selected);
        await refreshFileTree(selected);
      }
    } catch (err) {
      console.error("Open directory error:", err);
    }
  };

  const refreshFileTree = async (root: string) => {
    try {
      const result = await invoke<FileNode[]>("list_project_files", { root });
      setFiles(result);
    } catch (err) {
      console.error("List files error:", err);
      // Fallback demo tree if running in plain browser dev mode
      setFiles([
        { path: "src/main.rs", name: "main.rs", isDir: false, depth: 1 },
        { path: "src/app.tsx", name: "app.tsx", isDir: false, depth: 1 },
        { path: "src/editor/Editor.tsx", name: "Editor.tsx", isDir: false, depth: 2 },
        { path: "styles/theme.css", name: "theme.css", isDir: false, depth: 1 },
        { path: "package.json", name: "package.json", isDir: false, depth: 0 },
      ]);
    }
  };

  const openFile = async (path: string) => {
    const existing = tabs().find((t) => t.path === path);
    if (existing) {
      setActiveTabPath(path);
      return;
    }

    let content = "";
    try {
      content = await invoke<string>("read_file_content", { path });
    } catch {
      content = `// Opened file: ${path}\n// Ready for editing with Yones IDE.\n`;
    }

    const name = path.split(/[/\\]/).pop() || path;
    const newTab: OpenTab = { path, name, content, isModified: false };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabPath(path);
  };

  const closeTab = (path: string, e: MouseEvent) => {
    e.stopPropagation();
    const remaining = tabs().filter((t) => t.path !== path);
    setTabs(remaining);
    if (activeTabPath() === path) {
      setActiveTabPath(remaining.length > 0 ? remaining[remaining.length - 1].path : null);
    }
  };

  const handleApplyMultiFilePatch = async (
    patches: { filePath: string; blocks: { search: string; replace: string }[] }[]
  ) => {
    try {
      const txId = crypto.randomUUID();
      await invoke("execute_agent_tool", {
        name: "apply_diff",
        args: { transaction_id: txId, patches },
      });

      // Reload opened tabs
      for (const patch of patches) {
        const opened = tabs().find((t) => t.path.endsWith(patch.filePath) || patch.filePath.endsWith(t.path));
        if (opened) {
          try {
            const updated = await invoke<string>("read_file_content", { path: opened.path });
            setTabs((prev) =>
              prev.map((t) => (t.path === opened.path ? { ...t, content: updated, isModified: false } : t))
            );
          } catch (e) {
            console.error("Failed to reload file after patch:", e);
          }
        }
      }
    } catch (err) {
      console.error("Apply multi-file patch error:", err);
    }
  };

  const activeTab = () => tabs().find((t) => t.path === activeTabPath());

  const handleGlobalKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "o") {
      e.preventDefault();
      void handleOpenFolder();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
      e.preventDefault();
      setAssistantOpen((prev) => !prev);
    }
  };

  onMount(() => {
    window.addEventListener("keydown", handleGlobalKeyDown);
    // Initialize default welcome tab
    setTabs([
      {
        path: "welcome.ts",
        name: "welcome.ts",
        content: `// Welcome to Yones IDE (v2)\n// High-performance desktop code editor with embedded AI agent.\n//\n// Shortcuts:\n//   Cmd+O       - Open Folder\n//   Cmd+K       - Inline AI Edit\n//   Cmd+L       - Assistant Panel\n//   Tab         - Accept Ghost Completion\n//   Esc         - Cancel / Close\n`,
        isModified: false,
      },
    ]);
    setActiveTabPath("welcome.ts");
  });

  onCleanup(() => {
    window.removeEventListener("keydown", handleGlobalKeyDown);
  });

  return (
    <div class="h-screen w-screen flex flex-col bg-[var(--color-bg-editor)] text-[var(--color-fg-primary)] overflow-hidden font-sans">
      {/* Top Application Bar */}
      <header class="h-9 w-full bg-[var(--color-bg-panel)] border-b border-[var(--color-border-subtle)] flex items-center justify-between px-3 select-none">
        <div class="flex items-center gap-2">
          <span class="font-bold text-xs tracking-wider text-[var(--color-fg-primary)]">YONES</span>
          <span class="text-[10px] text-[var(--color-fg-muted)]">v2.0</span>
          <button
            type="button"
            class="ml-3 px-2 py-0.5 text-xs rounded bg-[var(--color-bg-raised)] border border-[var(--color-border)] hover:bg-[var(--color-bg-active)] cursor-pointer text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)]"
            onClick={handleOpenFolder}
          >
            Open Folder (Cmd+O)
          </button>
        </div>

        <div class="text-xs text-[var(--color-fg-muted)] truncate max-w-sm">
          {projectRoot() ?? "No folder open"}
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="px-2 py-0.5 text-xs rounded border transition-colors cursor-pointer"
            classList={{
              "bg-[var(--color-accent)] text-white border-transparent": assistantOpen(),
              "bg-[var(--color-bg-raised)] text-[var(--color-fg-secondary)] border-[var(--color-border)] hover:text-[var(--color-fg-primary)]":
                !assistantOpen(),
            }}
            onClick={() => setAssistantOpen((prev) => !prev)}
          >
            Assistant (Cmd+L)
          </button>
        </div>
      </header>

      {/* Main Workspace Area */}
      <div class="flex-1 flex overflow-hidden">
        {/* File Tree (Left Sidebar) */}
        <div class="w-60 h-full flex-shrink-0">
          <Tree
            files={files()}
            activeFile={activeTabPath()}
            onSelectFile={openFile}
            onToggleDir={(d) => console.log("Toggle dir", d)}
          />
        </div>

        {/* Editor Area (Center) */}
        <div class="flex-1 flex flex-col h-full overflow-hidden">
          {/* Tabs Bar */}
          <div class="h-8 w-full bg-[var(--color-bg-panel)] border-b border-[var(--color-border-subtle)] flex items-center overflow-x-auto px-1">
            <For each={tabs()}>
              {(tab) => (
                <div
                  class="h-7 px-3 flex items-center gap-2 text-xs border-r border-[var(--color-border-subtle)] cursor-pointer select-none group"
                  classList={{
                    "bg-[var(--color-bg-editor)] text-[var(--color-fg-primary)] border-t-2 border-t-[var(--color-accent)] font-medium":
                      activeTabPath() === tab.path,
                    "text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-raised)] hover:text-[var(--color-fg-secondary)]":
                      activeTabPath() !== tab.path,
                  }}
                  onClick={() => setActiveTabPath(tab.path)}
                >
                  <span class="truncate max-w-[120px]">{tab.name}</span>
                  <button
                    type="button"
                    class="opacity-0 group-hover:opacity-100 text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] leading-none text-xs"
                    onClick={(e) => closeTab(tab.path, e)}
                  >
                    &times;
                  </button>
                </div>
              )}
            </For>
          </div>

          {/* Editor Canvas */}
          <div class="flex-1 h-full w-full overflow-hidden">
            <Show
              when={activeTab()}
              fallback={
                <div class="h-full flex items-center justify-center text-xs text-[var(--color-fg-muted)]">
                  Press Cmd+O to open a project directory or select a file from the tree.
                </div>
              }
            >
              {(tab) => (
                <Editor
                  filePath={tab().path}
                  initialContent={tab().content}
                  onContentChange={(val) => {
                    setTabs((prev) =>
                      prev.map((t) => (t.path === tab().path ? { ...t, content: val, isModified: true } : t))
                    );
                  }}
                />
              )}
            </Show>
          </div>
        </div>

        {/* Assistant Sidebar (Right Panel, Cmd+L) */}
        <Show when={assistantOpen()}>
          <div class="w-80 h-full flex-shrink-0">
            <AssistantPanel
              availableFiles={files().map((f) => f.path)}
              currentFilePath={activeTabPath() ?? undefined}
              onApplyMultiFilePatch={handleApplyMultiFilePatch}
              onClose={() => setAssistantOpen(false)}
            />
          </div>
        </Show>
      </div>

      {/* Status Bar (Bottom) */}
      <StatusBar
        gitBranch={gitBranch()}
        theme={theme()}
        onToggleTheme={toggleTheme}
        sessionCostUsd={sessionCost()}
        tokensTotal={totalTokens()}
      />
    </div>
  );
}
