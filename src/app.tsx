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
import { getActiveModel, type ModelInfo } from "./settings/models";
import {
  SparklesIcon,
  FolderIcon,
  SearchIcon,
  CloseIcon,
  SunIcon,
  MoonIcon,
  GearIcon,
  ChevronRightIcon,
} from "./ui/icons";

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
  const [settingsTab, setSettingsTab] = createSignal<"keys" | "models">("keys");
  const [hasConfiguredKey, setHasConfiguredKey] = createSignal(true);
  const [activeModel, setActiveModel] = createSignal<ModelInfo | null>(getActiveModel());

  const checkApiKeys = async () => {
    try {
      const list = await fetchAllKeyStatuses();
      setHasConfiguredKey(list.some((s) => s.is_set));
    } catch {
      setHasConfiguredKey(false);
    }
  };

  const updateActiveModel = () => {
    setActiveModel(getActiveModel());
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
    window.addEventListener("yones-active-model-changed", updateActiveModel);
    window.addEventListener("yones-model-registry-updated", updateActiveModel);

    // Initialize default welcome tab
    setTabs([
      {
        path: "welcome.ts",
        name: "welcome.ts",
        content: `// Welcome to Yones IDE\n// High-performance AI-first Code Editor with embedded frontier intelligence.\n//\n// Shortcuts:\n//   Cmd+P / Ctrl+P     - Quick Open File\n//   Cmd+O / Ctrl+O     - Open Project Folder\n//   Cmd+L / Ctrl+L     - Open AI Assistant\n//   Cmd+K / Ctrl+K     - Inline AI Code Edit\n//   Cmd+Shift+F        - Global Project Search\n//   Tab                - Accept Ghost Completion\n//   Esc                - Dismiss popup / Close panel\n`,
        isModified: false,
      },
    ]);
    setActiveTabPath("welcome.ts");
    void checkApiKeys();
  });

  onCleanup(() => {
    window.removeEventListener("keydown", handleGlobalKeyDown);
    window.removeEventListener("yones-active-model-changed", updateActiveModel);
    window.removeEventListener("yones-model-registry-updated", updateActiveModel);
  });

  return (
    <div class="h-screen w-screen flex flex-col bg-[var(--color-bg-editor)] text-[var(--color-fg-primary)] overflow-hidden font-sans">
      {/* Top Application Bar */}
      <header class="h-10 w-full bg-[var(--color-bg-panel)] border-b border-[var(--color-border-subtle)] flex items-center justify-between px-3 select-none">
        {/* Left: Brand & Workspace Folder */}
        <div class="flex items-center gap-2.5">
          <div class="flex items-center gap-1.5">
            <span class="h-2 w-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
            <span class="font-bold text-xs tracking-wider text-[var(--color-fg-primary)]">YONES</span>
            <span class="text-[10px] font-mono px-1 py-0.2 rounded bg-[var(--color-bg-editor)] border border-[var(--color-border-subtle)] text-[var(--color-fg-muted)]">
              v2.1
            </span>
          </div>

          <span class="text-[var(--color-border-subtle)] opacity-70">/</span>

          <button
            type="button"
            class="px-2 py-1 text-xs rounded-md bg-[var(--color-bg-raised)] hover:bg-[var(--color-bg-active)] border border-[var(--color-border-subtle)] text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] flex items-center gap-1.5 transition-all cursor-pointer truncate max-w-[200px]"
            onClick={handleOpenFolder}
            title={projectRoot() ?? "Open Workspace Folder (Cmd+O)"}
          >
            <FolderIcon class="h-3.5 w-3.5 text-[var(--color-accent)] shrink-0" />
            <span class="truncate">
              {projectRoot() ? projectRoot()!.split(/[/\\]/).pop() : "Open Folder"}
            </span>
          </button>
        </div>

        {/* Center: Command Palette / Quick Open search bar */}
        <button
          type="button"
          class="flex items-center justify-between w-80 max-w-sm px-3 py-1 rounded-md bg-[var(--color-bg-editor)] hover:bg-[var(--color-bg-raised)] border border-[var(--color-border-subtle)] hover:border-[var(--color-border)] text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg-secondary)] shadow-sm transition-all cursor-pointer group"
          onClick={() => setQuickOpenOpen(true)}
        >
          <div class="flex items-center gap-2 truncate">
            <SearchIcon class="h-3.5 w-3.5 opacity-70 group-hover:text-[var(--color-accent)] transition-colors" />
            <span class="truncate">Search files, symbols (Ctrl+P)...</span>
          </div>
          <kbd class="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] text-[var(--color-fg-muted)] shrink-0">
            ⌘P
          </kbd>
        </button>

        {/* Right: Active Model, Assistant Toggle, Settings */}
        <div class="flex items-center gap-1.5">
          {/* Active Model Pill */}
          <button
            type="button"
            class="px-2.5 py-1 text-xs rounded-md border transition-all cursor-pointer flex items-center gap-1.5"
            classList={{
              "bg-[var(--color-bg-raised)] text-[var(--color-fg-primary)] border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-active)]":
                !!activeModel(),
              "bg-[var(--color-warning)]/10 text-[var(--color-warning)] border-[var(--color-warning)]/30 hover:bg-[var(--color-warning)]/20":
                !activeModel(),
            }}
            onClick={() => {
              setSettingsTab("models");
              setSettingsOpen(true);
            }}
            title="Configure AI Models (Cursor-style)"
          >
            <SparklesIcon class="h-3.5 w-3.5 text-[var(--color-accent)]" />
            <span class="truncate max-w-[130px] font-medium">
              {activeModel() ? activeModel()!.name : "Configure Model"}
            </span>
          </button>

          {/* AI Assistant Toggle Button */}
          <button
            type="button"
            class="px-2.5 py-1 text-xs rounded-md border transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
            classList={{
              "bg-[var(--color-accent)] text-white border-transparent font-medium": assistantOpen(),
              "bg-[var(--color-bg-raised)] text-[var(--color-fg-secondary)] border-[var(--color-border-subtle)] hover:text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-active)]":
                !assistantOpen(),
            }}
            onClick={() => setAssistantOpen((prev) => !prev)}
            title="Toggle AI Assistant (Cmd+L)"
          >
            <SparklesIcon class="h-3.5 w-3.5" />
            <span>Assistant</span>
            <kbd
              class="font-mono text-[9px] px-1 py-0.2 rounded opacity-80"
              classList={{
                "bg-black/20": assistantOpen(),
                "bg-[var(--color-bg-panel)]": !assistantOpen(),
              }}
            >
              ⌘L
            </kbd>
          </button>

          {/* Settings Button */}
          <button
            type="button"
            class="p-1.5 rounded-md text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-raised)] border border-transparent hover:border-[var(--color-border-subtle)] transition-all cursor-pointer"
            onClick={() => {
              setSettingsTab("keys");
              setSettingsOpen(true);
            }}
            title="Settings (API Keys & Preferences)"
          >
            <GearIcon class="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main Workspace Area */}
      <div class="flex-1 flex overflow-hidden">
        {/* Left Activity Bar */}
        <div class="w-11 h-full flex-shrink-0 flex flex-col items-center justify-between py-2 border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] z-10 select-none">
          <div class="flex flex-col items-center gap-1.5 w-full">
            {/* Files Tab Button */}
            <button
              type="button"
              class="w-8 h-8 rounded-md flex items-center justify-center transition-all cursor-pointer relative"
              classList={{
                "text-[var(--color-fg-primary)] bg-[var(--color-bg-active)]": sidebarTab() === "files",
                "text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-raised)]":
                  sidebarTab() !== "files",
              }}
              onClick={() => setSidebarTab("files")}
              title="Explorer (Cmd+Shift+E)"
            >
              <FolderIcon class="h-4 w-4" />
              <Show when={sidebarTab() === "files"}>
                <span class="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-[var(--color-accent)]" />
              </Show>
            </button>

            {/* Search Tab Button */}
            <button
              type="button"
              class="w-8 h-8 rounded-md flex items-center justify-center transition-all cursor-pointer relative"
              classList={{
                "text-[var(--color-fg-primary)] bg-[var(--color-bg-active)]": sidebarTab() === "search",
                "text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-raised)]":
                  sidebarTab() !== "search",
              }}
              onClick={() => setSidebarTab("search")}
              title="Search in Files (Cmd+Shift+F)"
            >
              <SearchIcon class="h-4 w-4" />
              <Show when={sidebarTab() === "search"}>
                <span class="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-[var(--color-accent)]" />
              </Show>
            </button>

            {/* AI Assistant Toggle Button */}
            <button
              type="button"
              class="w-8 h-8 rounded-md flex items-center justify-center transition-all cursor-pointer relative"
              classList={{
                "text-[var(--color-accent)] bg-[var(--color-bg-active)]": assistantOpen(),
                "text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-raised)]":
                  !assistantOpen(),
              }}
              onClick={() => setAssistantOpen((prev) => !prev)}
              title="AI Assistant (Cmd+L)"
            >
              <SparklesIcon class="h-4 w-4" />
              <Show when={assistantOpen()}>
                <span class="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-[var(--color-accent)]" />
              </Show>
            </button>
          </div>

          <div class="flex flex-col items-center gap-1.5 w-full">
            {/* Theme Toggle Button */}
            <button
              type="button"
              class="w-8 h-8 rounded-md flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-raised)] transition-all cursor-pointer"
              onClick={toggleTheme}
              title="Toggle Theme"
            >
              <Show when={theme() === "dark"} fallback={<MoonIcon class="h-4 w-4" />}>
                <SunIcon class="h-4 w-4" />
              </Show>
            </button>

            {/* Settings Button */}
            <button
              type="button"
              class="w-8 h-8 rounded-md flex items-center justify-center text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-raised)] transition-all cursor-pointer relative"
              onClick={() => {
                setSettingsTab("keys");
                setSettingsOpen(true);
              }}
              title="Settings (API Keys & Models)"
            >
              <GearIcon class="h-4 w-4" />
              <span
                class="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full"
                classList={{
                  "bg-[var(--color-success)]": hasConfiguredKey(),
                  "bg-[var(--color-warning)]": !hasConfiguredKey(),
                }}
              />
            </button>
          </div>
        </div>

        {/* Sidebar Panel (Files / Search Drawer) */}
        <div class="w-60 h-full flex-shrink-0 flex flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] overflow-hidden">
          <div class="h-8 flex items-center justify-between border-b border-[var(--color-border-subtle)] px-3 select-none">
            <span class="text-[11px] font-bold tracking-wider text-[var(--color-fg-muted)] uppercase">
              {sidebarTab() === "files" ? "Explorer" : "Search"}
            </span>
            <Show when={sidebarTab() === "files" && projectRoot()}>
              <span class="text-[10px] text-[var(--color-fg-muted)] font-mono truncate max-w-[110px]">
                {projectRoot()!.split(/[/\\]/).pop()}
              </span>
            </Show>
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
        <div class="flex-1 flex flex-col h-full overflow-hidden bg-[var(--color-bg-editor)]">
          {/* Tabs Bar */}
          <div class="h-8 w-full bg-[var(--color-bg-panel)] border-b border-[var(--color-border-subtle)] flex items-center overflow-x-auto px-1 select-none">
            <For each={tabs()}>
              {(tab) => {
                const isActive = () => activeTabPath() === tab.path;
                return (
                  <div
                    class="h-7 px-2.5 flex items-center gap-2 text-xs border-r border-[var(--color-border-subtle)] cursor-pointer select-none group transition-colors relative"
                    classList={{
                      "bg-[var(--color-bg-editor)] text-[var(--color-fg-primary)] font-medium": isActive(),
                      "text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-raised)] hover:text-[var(--color-fg-secondary)]":
                        !isActive(),
                    }}
                    onClick={() => setActiveTabPath(tab.path)}
                  >
                    {/* Active Accent Top Indicator */}
                    <Show when={isActive()}>
                      <span class="absolute top-0 left-0 right-0 h-[2px] bg-[var(--color-accent)]" />
                    </Show>

                    <span class="truncate max-w-[130px]">{tab.name}</span>
                    <Show when={tab.isModified}>
                      <span
                        class="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] shrink-0"
                        title="Unsaved changes"
                      />
                    </Show>
                    <button
                      type="button"
                      class="opacity-0 group-hover:opacity-100 text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] p-0.5 rounded hover:bg-[var(--color-bg-active)] flex items-center justify-center transition-opacity"
                      classList={{ "opacity-80": isActive() }}
                      onClick={(e) => closeTab(tab.path, e)}
                    >
                      <CloseIcon class="h-3 w-3" />
                    </button>
                  </div>
                );
              }}
            </For>
          </div>

          {/* Breadcrumb path navigation bar */}
          <Show when={activeTab()}>
            <div class="h-6 w-full bg-[var(--color-bg-editor)] border-b border-[var(--color-border-subtle)]/40 px-3 flex items-center gap-1.5 text-[11px] text-[var(--color-fg-muted)] select-none">
              <FolderIcon class="h-3 w-3 opacity-60" />
              <span class="hover:text-[var(--color-fg-primary)] transition-colors cursor-pointer">
                {projectRoot() ? projectRoot()!.split(/[/\\]/).pop() : "workspace"}
              </span>
              <ChevronRightIcon class="h-2.5 w-2.5 opacity-40" />
              <span class="text-[var(--color-fg-primary)] font-medium truncate max-w-sm">
                {activeTab()?.path}
              </span>
            </div>
          </Show>

          {/* Editor Canvas */}
          <div class="flex-1 h-full w-full overflow-hidden">
            <Show
              when={activeTab()}
              fallback={
                <div class="h-full w-full flex flex-col items-center justify-center p-8 select-none bg-[var(--color-bg-editor)]">
                  <div class="max-w-md w-full text-center space-y-6">
                    <div class="flex flex-col items-center gap-3">
                      <div class="h-14 w-14 rounded-2xl bg-gradient-to-br from-[var(--color-accent)]/20 to-[var(--color-accent)]/5 border border-[var(--color-accent)]/30 flex items-center justify-center shadow-lg">
                        <SparklesIcon class="h-7 w-7 text-[var(--color-accent)]" />
                      </div>
                      <div>
                        <h1 class="text-base font-semibold text-[var(--color-fg-primary)] tracking-wide">
                          YONES IDE
                        </h1>
                        <p class="text-xs text-[var(--color-fg-muted)] mt-0.5">
                          High-performance AI-first Code Editor
                        </p>
                      </div>
                    </div>

                    {/* Shortcuts Cheat Sheet */}
                    <div class="grid grid-cols-2 gap-2 text-left">
                      <button
                        type="button"
                        class="p-2.5 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] hover:bg-[var(--color-bg-active)] hover:border-[var(--color-accent)]/40 transition-all cursor-pointer text-xs group"
                        onClick={() => setQuickOpenOpen(true)}
                      >
                        <div class="flex items-center justify-between">
                          <span class="font-medium text-[var(--color-fg-primary)] group-hover:text-[var(--color-accent)]">
                            Quick Open
                          </span>
                          <kbd class="font-mono text-[10px] px-1 py-0.5 rounded bg-[var(--color-bg-editor)] border border-[var(--color-border-subtle)] text-[var(--color-fg-muted)]">
                            ⌘P
                          </kbd>
                        </div>
                        <div class="text-[11px] text-[var(--color-fg-muted)] mt-1">
                          Jump to any file in project
                        </div>
                      </button>

                      <button
                        type="button"
                        class="p-2.5 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] hover:bg-[var(--color-bg-active)] hover:border-[var(--color-accent)]/40 transition-all cursor-pointer text-xs group"
                        onClick={handleOpenFolder}
                      >
                        <div class="flex items-center justify-between">
                          <span class="font-medium text-[var(--color-fg-primary)] group-hover:text-[var(--color-accent)]">
                            Open Folder
                          </span>
                          <kbd class="font-mono text-[10px] px-1 py-0.5 rounded bg-[var(--color-bg-editor)] border border-[var(--color-border-subtle)] text-[var(--color-fg-muted)]">
                            ⌘O
                          </kbd>
                        </div>
                        <div class="text-[11px] text-[var(--color-fg-muted)] mt-1">
                          Load workspace directory
                        </div>
                      </button>

                      <button
                        type="button"
                        class="p-2.5 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] hover:bg-[var(--color-bg-active)] hover:border-[var(--color-accent)]/40 transition-all cursor-pointer text-xs group"
                        onClick={() => setAssistantOpen(true)}
                      >
                        <div class="flex items-center justify-between">
                          <span class="font-medium text-[var(--color-fg-primary)] group-hover:text-[var(--color-accent)]">
                            AI Assistant
                          </span>
                          <kbd class="font-mono text-[10px] px-1 py-0.5 rounded bg-[var(--color-bg-editor)] border border-[var(--color-border-subtle)] text-[var(--color-fg-muted)]">
                            ⌘L
                          </kbd>
                        </div>
                        <div class="text-[11px] text-[var(--color-fg-muted)] mt-1">
                          Pair program with frontier models
                        </div>
                      </button>

                      <button
                        type="button"
                        class="p-2.5 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] hover:bg-[var(--color-bg-active)] hover:border-[var(--color-accent)]/40 transition-all cursor-pointer text-xs group"
                        onClick={() => setSidebarTab("search")}
                      >
                        <div class="flex items-center justify-between">
                          <span class="font-medium text-[var(--color-fg-primary)] group-hover:text-[var(--color-accent)]">
                            Global Search
                          </span>
                          <kbd class="font-mono text-[10px] px-1 py-0.5 rounded bg-[var(--color-bg-editor)] border border-[var(--color-border-subtle)] text-[var(--color-fg-muted)]">
                            ⌘⇧F
                          </kbd>
                        </div>
                        <div class="text-[11px] text-[var(--color-fg-muted)] mt-1">
                          Regex search across workspace
                        </div>
                      </button>
                    </div>
                  </div>
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
          <div class="w-80 h-full flex-shrink-0 shadow-2xl">
            <AssistantPanel
              availableFiles={files().map((f) => f.path)}
              currentFilePath={activeTabPath() ?? undefined}
              hasApiKey={hasConfiguredKey()}
              onApplyMultiFilePatch={handleApplyMultiFilePatch}
              onRevertMultiFilePatch={handleRevertMultiFilePatch}
              onOpenSettings={(tab) => {
                setSettingsTab(tab ?? "keys");
                setSettingsOpen(true);
              }}
              onClose={() => setAssistantOpen(false)}
            />
          </div>
        </Show>
      </div>

      {/* Status Bar */}
      <StatusBar
        theme={theme()}
        onToggleTheme={toggleTheme}
        gitBranch={gitBranch()}
        errorCount={diagnosticsCount().errors}
        warningCount={diagnosticsCount().warnings}
        language={activeTab() ? activeTab()!.name.split(".").pop()?.toUpperCase() : "TypeScript"}
        tokensTotal={totalTokens()}
        sessionCostUsd={sessionCost()}
        activeModelName={activeModel()?.name}
        typingLatencyMs={0.005}
        onOpenModelSettings={() => {
          setSettingsTab("models");
          setSettingsOpen(true);
        }}
      />

      {/* Quick Open Modal (Cmd+P) */}
      <Show when={quickOpenOpen()}>
        <QuickOpen
          files={files()}
          onSelect={(path) => {
            setQuickOpenOpen(false);
            void openFile(path);
          }}
          onClose={() => setQuickOpenOpen(false)}
        />
      </Show>

      {/* Settings Modal (API Keys & Models) */}
      <Show when={settingsOpen()}>
        <ApiKeyModal
          initialTab={settingsTab()}
          onClose={() => setSettingsOpen(false)}
          onKeysUpdated={checkApiKeys}
          onModelsUpdated={updateActiveModel}
        />
      </Show>
    </div>
  );
}
