import { createSignal, onMount, onCleanup, Show, For } from "solid-js";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { Editor } from "./editor/Editor";
import { Tree, type FileNode } from "./files/Tree";
import { QuickOpen } from "./files/QuickOpen";
import { SearchPanel } from "./files/SearchPanel";
import { AssistantPanel } from "./assistant/Panel";
import { StatusBar } from "./ui/StatusBar";
import { ApiKeyModal } from "./settings/ApiKeyModal";
import { fetchAllKeyStatuses } from "./settings/api-keys";
import { GearIcon, SparklesIcon, FolderIcon, SearchIcon, CloseIcon } from "./ui/icons";

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
  const [activeTabTargetLine, setActiveTabTargetLine] = createSignal<number | undefined>(undefined);
  const [sidebarTab, setSidebarTab] = createSignal<"files" | "search">("files");
  const [quickOpenOpen, setQuickOpenOpen] = createSignal(false);
  const [assistantOpen, setAssistantOpen] = createSignal(false);
  const [gitBranch] = createSignal("main");
  const [sessionCost] = createSignal(0);
  const [totalTokens] = createSignal(0);
  const [diagnosticsCount, setDiagnosticsCount] = createSignal<{ errors: number; warnings: number }>({
    errors: 0,
    warnings: 0,
  });
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [hasConfiguredKey, setHasConfiguredKey] = createSignal(true);

  const checkApiKeys = async () => {
    try {
      const list = await fetchAllKeyStatuses();
      setHasConfiguredKey(list.some((s) => s.is_set));
    } catch {
      setHasConfiguredKey(false);
    }
  };

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

  const handleSave = async (content?: string) => {
    const curPath = activeTabPath();
    if (!curPath) return;
    const tab = tabs().find((t) => t.path === curPath);
    const saveContent = content !== undefined ? content : tab?.content ?? "";
    try {
      await invoke("save_file_content", { path: curPath, content: saveContent });
      setTabs((prev) =>
        prev.map((t) => (t.path === curPath ? { ...t, content: saveContent, isModified: false } : t))
      );
    } catch (err) {
      console.error("Failed to save file:", err);
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
    } catch (err) {
      console.error(`Failed to read file '${path}':`, err);
      content = "";
    }

    const name = path.split(/[/\\]/).pop() || path;
    const newTab: OpenTab = { path, name, content, isModified: false };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabPath(path);
  };

  const openFileAtLine = async (path: string, line: number) => {
    await openFile(path);
    setActiveTabTargetLine(line);
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
    patches: { filePath: string; blocks: { search: string; replace: string }[] }[],
    txId: string
  ): Promise<boolean> => {
    try {
      await invoke("execute_agent_tool", {
        name: "apply_diff",
        args: {
          transaction_id: txId,
          patches: patches.map((p) => ({
            relative_path: p.filePath,
            blocks: p.blocks,
          })),
        },
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
      return true;
    } catch (err) {
      console.error("Apply multi-file patch error:", err);
      return false;
    }
  };

  const handleRevertMultiFilePatch = async (txId: string, filePaths: string[]): Promise<boolean> => {
    try {
      await invoke("execute_agent_tool", {
        name: "rollback_transaction",
        args: { transaction_id: txId },
      });

      // Reload affected opened tabs
      for (const filePath of filePaths) {
        const opened = tabs().find((t) => t.path.endsWith(filePath) || filePath.endsWith(t.path));
        if (opened) {
          try {
            const updated = await invoke<string>("read_file_content", { path: opened.path });
            setTabs((prev) =>
              prev.map((t) => (t.path === opened.path ? { ...t, content: updated, isModified: false } : t))
            );
          } catch (e) {
            console.error("Failed to reload file after rollback:", e);
          }
        }
      }
      return true;
    } catch (err) {
      console.error("Rollback multi-file patch error:", err);
      return false;
    }
  };

  const activeTab = () => tabs().find((t) => t.path === activeTabPath());

  const handleGlobalKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "o") {
      e.preventDefault();
      void handleOpenFolder();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") {
      e.preventDefault();
      setQuickOpenOpen((prev) => !prev);
    } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      setSidebarTab((prev) => (prev === "search" ? "files" : "search"));
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void handleSave();
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
    void checkApiKeys();
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
            class="ml-2 px-2.5 py-1 text-xs rounded bg-[var(--color-bg-raised)] border border-[var(--color-border)] hover:bg-[var(--color-bg-active)] cursor-pointer text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] flex items-center gap-1.5"
            onClick={handleOpenFolder}
          >
            <FolderIcon class="h-3.5 w-3.5 opacity-80" />
            <span>Open Folder (Cmd+O)</span>
          </button>
          <button
            type="button"
            class="px-2.5 py-1 text-xs rounded bg-[var(--color-bg-raised)] border border-[var(--color-border)] hover:bg-[var(--color-bg-active)] cursor-pointer text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] flex items-center gap-1.5"
            onClick={() => setQuickOpenOpen(true)}
          >
            <SearchIcon class="h-3.5 w-3.5 opacity-80" />
            <span>Quick Open (Cmd+P)</span>
          </button>
        </div>

        <div class="text-xs text-[var(--color-fg-muted)] truncate max-w-sm">
          {projectRoot() ?? "No folder open"}
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="px-2.5 py-1 text-xs rounded border transition-colors cursor-pointer flex items-center gap-1.5"
            classList={{
              "bg-[var(--color-accent)] text-white border-transparent": settingsOpen(),
              "bg-[var(--color-bg-raised)] text-[var(--color-fg-secondary)] border-[var(--color-border)] hover:text-[var(--color-fg-primary)]":
                !settingsOpen(),
            }}
            onClick={() => setSettingsOpen(true)}
            title="Configure API Keys & Model Providers"
          >
            <GearIcon class="h-3.5 w-3.5" />
            <span>API Keys</span>
            <span
              class="h-1.5 w-1.5 rounded-full"
              classList={{
                "bg-[var(--color-success)]": hasConfiguredKey(),
                "bg-[var(--color-warning)]": !hasConfiguredKey(),
              }}
            />
          </button>

          <button
            type="button"
            class="px-2.5 py-1 text-xs rounded border transition-colors cursor-pointer flex items-center gap-1.5"
            classList={{
              "bg-[var(--color-accent)] text-white border-transparent": assistantOpen(),
              "bg-[var(--color-bg-raised)] text-[var(--color-fg-secondary)] border-[var(--color-border)] hover:text-[var(--color-fg-primary)]":
                !assistantOpen(),
            }}
            onClick={() => setAssistantOpen((prev) => !prev)}
          >
            <SparklesIcon class="h-3.5 w-3.5" />
            <span>Assistant (Cmd+L)</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Area */}
      <div class="flex-1 flex overflow-hidden">
        {/* Left Sidebar (Files / Search) */}
        <div class="w-64 h-full flex-shrink-0 flex flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)]">
          {/* Sidebar Tab Header */}
          <div class="h-8 flex items-center border-b border-[var(--color-border-subtle)] px-2 gap-1 select-none">
            <button
              type="button"
              class="px-2.5 py-1 text-xs rounded font-medium cursor-pointer transition-colors flex items-center gap-1.5"
              classList={{
                "bg-[var(--color-bg-active)] text-[var(--color-fg-primary)]": sidebarTab() === "files",
                "text-[var(--color-fg-muted)] hover:text-[var(--color-fg-secondary)]": sidebarTab() !== "files",
              }}
              onClick={() => setSidebarTab("files")}
            >
              <FolderIcon class="h-3.5 w-3.5 opacity-80" />
              <span>Files</span>
            </button>
            <button
              type="button"
              class="px-2.5 py-1 text-xs rounded font-medium cursor-pointer transition-colors flex items-center gap-1.5"
              classList={{
                "bg-[var(--color-bg-active)] text-[var(--color-fg-primary)]": sidebarTab() === "search",
                "text-[var(--color-fg-muted)] hover:text-[var(--color-fg-secondary)]": sidebarTab() !== "search",
              }}
              onClick={() => setSidebarTab("search")}
            >
              <SearchIcon class="h-3.5 w-3.5 opacity-80" />
              <span>Search (Cmd+Shift+F)</span>
            </button>
          </div>

          <div class="flex-1 overflow-hidden">
            <Show when={sidebarTab() === "files"}>
              <Tree
                files={files()}
                activeFile={activeTabPath()}
                onSelectFile={(path) => {
                  setActiveTabTargetLine(undefined);
                  void openFile(path);
                }}
                onToggleDir={(d) => console.log("Toggle dir", d)}
              />
            </Show>
            <Show when={sidebarTab() === "search"}>
              <SearchPanel
                onSelectMatch={openFileAtLine}
                onClose={() => setSidebarTab("files")}
              />
            </Show>
          </div>
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
                  <Show when={tab.isModified}>
                    <span class="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] shrink-0" title="Unsaved changes" />
                  </Show>
                  <button
                    type="button"
                    class="opacity-0 group-hover:opacity-100 text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] p-0.5 rounded hover:bg-[var(--color-bg-panel)] flex items-center justify-center"
                    onClick={(e) => closeTab(tab.path, e)}
                  >
                    <CloseIcon class="h-3 w-3" />
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
                  Press Cmd+O to open a project directory or Cmd+P to quick open a file.
                </div>
              }
            >
              {(tab) => (
                <Editor
                  filePath={tab().path}
                  initialContent={tab().content}
                  targetLine={activeTabTargetLine()}
                  onDiagnosticsChange={setDiagnosticsCount}
                  onSave={handleSave}
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
              hasApiKey={hasConfiguredKey()}
              onOpenSettings={() => setSettingsOpen(true)}
              onApplyMultiFilePatch={handleApplyMultiFilePatch}
              onRevertMultiFilePatch={handleRevertMultiFilePatch}
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
        errorCount={diagnosticsCount().errors}
        warningCount={diagnosticsCount().warnings}
        sessionCostUsd={sessionCost()}
        tokensTotal={totalTokens()}
      />

      {/* Quick Open Modal (Cmd+P) */}
      <Show when={quickOpenOpen()}>
        <QuickOpen
          files={files()}
          onSelect={(path) => {
            setActiveTabTargetLine(undefined);
            void openFile(path);
          }}
          onClose={() => setQuickOpenOpen(false)}
        />
      </Show>

      {/* Settings / API Keys Modal */}
      <Show when={settingsOpen()}>
        <ApiKeyModal
          onClose={() => setSettingsOpen(false)}
          onKeysUpdated={checkApiKeys}
        />
      </Show>
    </div>
  );
}
