import { createSignal, onMount, For, Show } from "solid-js";
import {
  PROVIDER_CATALOG,
  fetchAllKeyStatuses,
  saveApiKey,
  removeApiKey,
  testApiKey,
  type KeyStatus,
} from "./api-keys";
import {
  loadModels,
  toggleModel,
  addCustomModel,
  removeCustomModel,
  fetchRemoteModels,
  type ModelInfo,
  type ModelProvider,
} from "./models";
import {
  CloseIcon,
  ExternalLinkIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  KeyIcon,
  SparklesIcon,
  SearchIcon,
  WarningIcon,
} from "../ui/icons";
import { Toggle } from "../ui/Toggle";

export interface ApiKeyModalProps {
  initialTab?: "keys" | "models";
  onClose: () => void;
  onKeysUpdated?: () => void;
  onModelsUpdated?: () => void;
}

export function ApiKeyModal(props: ApiKeyModalProps) {
  const [modalTab, setModalTab] = createSignal<"keys" | "models">(props.initialTab || "keys");

  // API Keys state
  const [statuses, setStatuses] = createSignal<KeyStatus[]>([]);
  const [selectedProviderId, setSelectedProviderId] = createSignal("anthropic");
  const [keyInput, setKeyInput] = createSignal("");
  const [showKey, setShowKey] = createSignal(false);
  const [isSaving, setIsSaving] = createSignal(false);
  const [isTesting, setIsTesting] = createSignal(false);
  const [testResult, setTestResult] = createSignal<{ success: boolean; message: string } | null>(null);

  // Models state (Cursor-style)
  const [modelsList, setModelsList] = createSignal<ModelInfo[]>([]);
  const [modelSearch, setModelSearch] = createSignal("");
  const [providerFilter, setProviderFilter] = createSignal<string>("all");
  const [showAddCustom, setShowAddCustom] = createSignal(false);
  const [customModelId, setCustomModelId] = createSignal("");
  const [customModelName, setCustomModelName] = createSignal("");
  const [customProvider, setCustomProvider] = createSignal<ModelProvider>("openrouter");
  const [customContext, setCustomContext] = createSignal("128k");
  const [isFetchingRemote, setIsFetchingRemote] = createSignal(false);
  const [discoverNotice, setDiscoverNotice] = createSignal<string | null>(null);

  const refreshStatuses = async () => {
    const list = await fetchAllKeyStatuses();
    setStatuses(list);
  };

  const refreshModels = () => {
    setModelsList(loadModels());
  };

  onMount(() => {
    void refreshStatuses();
    refreshModels();
  });

  const selectedMeta = () =>
    PROVIDER_CATALOG.find((p) => p.id === selectedProviderId()) || PROVIDER_CATALOG[0];

  const currentStatus = () =>
    statuses().find((s) => s.provider === selectedProviderId());

  const handleSelectProvider = (id: string) => {
    setSelectedProviderId(id);
    setKeyInput("");
    setTestResult(null);
    setShowKey(false);
  };

  const handleSaveKey = async () => {
    const key = keyInput().trim();
    if (!key) return;

    setIsSaving(true);
    setTestResult(null);

    try {
      await saveApiKey(selectedProviderId(), key);
      await refreshStatuses();
      setKeyInput("");
      props.onKeysUpdated?.();
      setTestResult({ success: true, message: "API key saved successfully in secure credential store." });
    } catch (err) {
      setTestResult({ success: false, message: `Failed to save key: ${String(err)}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveKey = async () => {
    setIsSaving(true);
    setTestResult(null);

    try {
      await removeApiKey(selectedProviderId());
      await refreshStatuses();
      props.onKeysUpdated?.();
      setTestResult({ success: true, message: "API key removed." });
    } catch (err) {
      setTestResult({ success: false, message: `Failed to remove key: ${String(err)}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestKey = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const keyToTest = keyInput().trim() || undefined;
      const msg = await testApiKey(selectedProviderId(), keyToTest);
      setTestResult({ success: true, message: msg || "Connection verified successfully." });
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsTesting(false);
    }
  };

  const isProviderKeySet = (provider: string) => {
    if (provider === "ollama") return true; // Local models
    const status = statuses().find((s) => s.provider === provider);
    return status?.is_set ?? false;
  };

  // Model Toggle handlers
  const handleModelToggle = (id: string, enabled: boolean) => {
    const model = modelsList().find((m) => m.id === id);
    if (enabled && model && !isProviderKeySet(model.provider)) {
      setDiscoverNotice(
        `Cannot enable ${model.name}: API key for ${model.provider.toUpperCase()} is not set. Please configure it in the API Keys tab.`
      );
      setSelectedProviderId(model.provider);
      return;
    }
    const updated = toggleModel(id, enabled);
    setModelsList(updated);
    props.onModelsUpdated?.();
  };

  const handleAddCustomModel = (e: Event) => {
    e.preventDefault();
    const id = customModelId().trim();
    if (!id) return;

    const name = customModelName().trim() || id;
    const updated = addCustomModel({
      id,
      name,
      provider: customProvider(),
      context: customContext().trim() || "128k",
      description: "Custom user-configured model",
    });

    setModelsList(updated);
    setCustomModelId("");
    setCustomModelName("");
    setShowAddCustom(false);
    props.onModelsUpdated?.();
  };

  const handleRemoveCustomModel = (id: string) => {
    const updated = removeCustomModel(id);
    setModelsList(updated);
    props.onModelsUpdated?.();
  };

  const handleDiscoverOllama = async () => {
    setIsFetchingRemote(true);
    setDiscoverNotice(null);
    try {
      const remote = await fetchRemoteModels("ollama");
      if (remote.length === 0) {
        setDiscoverNotice("No local models found on http://localhost:11434.");
      } else {
        for (const name of remote) {
          addCustomModel({
            id: name,
            name: `${name} (Local)`,
            provider: "ollama",
            context: "64k",
            description: "Local Ollama model",
          });
        }
        refreshModels();
        setDiscoverNotice(`Discovered ${remote.length} local Ollama model(s)!`);
        props.onModelsUpdated?.();
      }
    } catch (err) {
      setDiscoverNotice(`Could not reach Ollama (http://localhost:11434): ${String(err)}`);
    } finally {
      setIsFetchingRemote(false);
    }
  };

  const handleDiscoverOpenRouter = async () => {
    setIsFetchingRemote(true);
    setDiscoverNotice(null);
    try {
      const remote = await fetchRemoteModels("openrouter");
      if (remote.length > 0) {
        for (const id of remote.slice(0, 15)) {
          const shortName = id.split("/").pop() || id;
          addCustomModel({
            id,
            name: shortName,
            provider: "openrouter",
            context: "128k",
            description: "Discovered via OpenRouter",
          });
        }
        refreshModels();
        setDiscoverNotice(`Added top ${Math.min(remote.length, 15)} models from OpenRouter!`);
        props.onModelsUpdated?.();
      }
    } catch (err) {
      setDiscoverNotice(`Failed to fetch models from OpenRouter: ${String(err)}`);
    } finally {
      setIsFetchingRemote(false);
    }
  };

  const filteredModels = () => {
    const query = modelSearch().toLowerCase().trim();
    const filter = providerFilter();

    return modelsList().filter((m) => {
      const matchesProvider = filter === "all" || m.provider === filter;
      const matchesQuery =
        !query ||
        m.name.toLowerCase().includes(query) ||
        m.id.toLowerCase().includes(query) ||
        (m.description || "").toLowerCase().includes(query);
      return matchesProvider && matchesQuery;
    });
  };

  const enabledCount = () => modelsList().filter((m) => m.enabled).length;

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay)] p-4 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div class="w-full max-w-2xl rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-panel)] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Top Header */}
        <div class="h-12 px-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between bg-[var(--color-bg-raised)]">
          {/* Navigation Tabs */}
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-colors flex items-center gap-1.5"
              classList={{
                "bg-[var(--color-bg-editor)] text-[var(--color-fg-primary)] shadow-sm":
                  modalTab() === "keys",
                "text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-panel)]":
                  modalTab() !== "keys",
              }}
              onClick={() => setModalTab("keys")}
            >
              <KeyIcon class="h-3.5 w-3.5" />
              <span>API Keys</span>
            </button>

            <button
              type="button"
              class="px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-colors flex items-center gap-1.5"
              classList={{
                "bg-[var(--color-bg-editor)] text-[var(--color-fg-primary)] shadow-sm":
                  modalTab() === "models",
                "text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-panel)]":
                  modalTab() !== "models",
              }}
              onClick={() => setModalTab("models")}
            >
              <SparklesIcon class="h-3.5 w-3.5" />
              <span>Models</span>
              <span class="text-[10px] px-1.5 py-0.2 rounded-full bg-[var(--color-accent)] text-white font-mono">
                {enabledCount()}
              </span>
            </button>
          </div>

          <button
            type="button"
            class="text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] cursor-pointer p-1 rounded hover:bg-[var(--color-bg-active)] flex items-center justify-center"
            onClick={props.onClose}
          >
            <CloseIcon class="h-4 w-4" />
          </button>
        </div>

        {/* Tab 1: API Keys Management */}
        <Show when={modalTab() === "keys"}>
          <div class="flex-1 flex overflow-hidden">
            {/* Provider List Sidebar */}
            <div class="w-52 border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] p-2 space-y-1 overflow-y-auto">
              <For each={PROVIDER_CATALOG}>
                {(provider) => {
                  const status = () => statuses().find((s) => s.provider === provider.id);
                  const isSelected = () => selectedProviderId() === provider.id;

                  return (
                    <button
                      type="button"
                      class="w-full text-left px-3 py-2.5 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors"
                      classList={{
                        "bg-[var(--color-bg-active)] text-[var(--color-fg-primary)] font-medium": isSelected(),
                        "text-[var(--color-fg-secondary)] hover:bg-[var(--color-bg-raised)] hover:text-[var(--color-fg-primary)]":
                          !isSelected(),
                      }}
                      onClick={() => handleSelectProvider(provider.id)}
                    >
                      <span>{provider.name}</span>
                      <span
                        class="h-2 w-2 rounded-full"
                        classList={{
                          "bg-[var(--color-success)]": !!status()?.is_set,
                          "bg-[var(--color-border)]": !status()?.is_set,
                        }}
                        title={status()?.is_set ? "Configured" : "Not configured"}
                      />
                    </button>
                  );
                }}
              </For>
            </div>

            {/* Provider Configuration Panel */}
            <div class="flex-1 p-5 overflow-y-auto space-y-4 bg-[var(--color-bg-editor)]">
              <div>
                <div class="flex items-center justify-between">
                  <h3 class="text-sm font-semibold text-[var(--color-fg-primary)]">
                    {selectedMeta().name}
                  </h3>
                  <a
                    href={selectedMeta().docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    class="text-[11px] text-[var(--color-accent)] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>Get API Key</span>
                    <ExternalLinkIcon class="h-3 w-3" />
                  </a>
                </div>
                <p class="text-xs text-[var(--color-fg-muted)] mt-1">
                  {selectedMeta().description}
                </p>
              </div>

              {/* Current status display */}
              <div class="p-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] space-y-2">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-[var(--color-fg-muted)]">Configuration Status:</span>
                  <Show
                    when={currentStatus()?.is_set}
                    fallback={
                      <span class="text-[var(--color-warning)] font-medium flex items-center gap-1.5">
                        <span class="h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]" />
                        <span>Not configured</span>
                      </span>
                    }
                  >
                    <span class="text-[var(--color-success)] font-medium flex items-center gap-1.5">
                      <CheckIcon class="h-3.5 w-3.5" />
                      <span>Active ({currentStatus()?.source})</span>
                    </span>
                  </Show>
                </div>

                <Show when={currentStatus()?.is_set}>
                  <div class="flex items-center justify-between text-xs pt-1 border-t border-[var(--color-border-subtle)]">
                    <span class="font-mono text-[11px] text-[var(--color-fg-secondary)]">
                      {currentStatus()?.masked}
                    </span>
                    <button
                      type="button"
                      class="text-[11px] text-[var(--color-danger)] hover:underline cursor-pointer"
                      onClick={handleRemoveKey}
                      disabled={isSaving()}
                    >
                      Remove Key
                    </button>
                  </div>
                </Show>
              </div>

              {/* Input field */}
              <div class="space-y-1.5">
                <label class="text-xs font-medium text-[var(--color-fg-primary)] block">
                  {currentStatus()?.is_set ? "Update API Key:" : "Enter API Key:"}
                </label>
                <div class="relative">
                  <input
                    type={showKey() ? "text" : "password"}
                    placeholder={selectedMeta().placeholder}
                    class="w-full px-3 py-2 pr-10 text-xs rounded-lg font-mono bg-[var(--color-bg-raised)] border border-[var(--color-border)] text-[var(--color-fg-primary)] placeholder-[var(--color-fg-muted)] outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent-ring)]"
                    value={keyInput()}
                    onInput={(e) => setKeyInput(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveKey();
                    }}
                  />
                  <button
                    type="button"
                    class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] cursor-pointer"
                    onClick={() => setShowKey(!showKey())}
                    title={showKey() ? "Hide secret" : "Show secret"}
                  >
                    <Show when={showKey()} fallback={<EyeIcon class="h-4 w-4" />}>
                      <EyeOffIcon class="h-4 w-4" />
                    </Show>
                  </button>
                </div>
              </div>

              {/* Action buttons */}
              <div class="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  class="px-4 py-2 text-xs font-medium rounded-lg bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] active:bg-[var(--color-accent-press)] cursor-pointer disabled:opacity-40 transition-colors"
                  onClick={handleSaveKey}
                  disabled={isSaving() || !keyInput().trim()}
                >
                  {isSaving() ? "Saving..." : "Save Key"}
                </button>

                <button
                  type="button"
                  class="px-3.5 py-2 text-xs font-medium rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-raised)] text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-active)] cursor-pointer disabled:opacity-40 transition-colors"
                  onClick={handleTestKey}
                  disabled={isTesting() || (!keyInput().trim() && !currentStatus()?.is_set)}
                >
                  {isTesting() ? "Testing Connection..." : "Test Connection"}
                </button>
              </div>

              {/* Feedback messages */}
              <Show when={testResult()}>
                {(res) => (
                  <div
                    class="p-3 rounded-lg text-xs flex items-start gap-2 border"
                    classList={{
                      "bg-[var(--color-success-bg)] text-[var(--color-success)] border-[var(--color-success-border)]":
                        res().success,
                      "bg-[var(--color-danger-bg)] text-[var(--color-danger)] border-[var(--color-danger-border)]":
                        !res().success,
                    }}
                  >
                    <span class="font-medium">{res().message}</span>
                  </div>
                )}
              </Show>
            </div>
          </div>
        </Show>

        {/* Tab 2: Cursor-Style Models Management with Toggles */}
        <Show when={modalTab() === "models"}>
          <div class="flex-1 flex flex-col overflow-hidden bg-[var(--color-bg-editor)]">
            {/* Search & Action Bar */}
            <div class="p-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] space-y-2.5">
              <div class="flex items-center gap-2">
                <div class="relative flex-1">
                  <SearchIcon class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-fg-muted)]" />
                  <input
                    type="text"
                    placeholder="Search models by name or id (e.g. claude, gpt, deepseek)..."
                    class="w-full pl-8 pr-3 py-1.5 text-xs rounded-md bg-[var(--color-bg-editor)] border border-[var(--color-border-subtle)] text-[var(--color-fg-primary)] placeholder-[var(--color-fg-muted)] outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent-ring)]"
                    value={modelSearch()}
                    onInput={(e) => setModelSearch(e.currentTarget.value)}
                  />
                </div>

                <button
                  type="button"
                  class="px-2.5 py-1.5 text-xs font-medium rounded-md border border-[var(--color-border)] bg-[var(--color-bg-raised)] text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-active)] cursor-pointer transition-colors"
                  onClick={() => setShowAddCustom(!showAddCustom())}
                >
                  + Add Custom Model
                </button>
              </div>

              {/* Provider filter tags & Discover buttons */}
              <div class="flex items-center justify-between text-xs pt-0.5">
                <div class="flex items-center gap-1.5 overflow-x-auto">
                  <For each={["all", "anthropic", "openai", "openrouter", "gemini", "ollama"]}>
                    {(filter) => (
                      <button
                        type="button"
                        class="px-2.5 py-1 text-[11px] rounded-full cursor-pointer transition-colors capitalize"
                        classList={{
                          "bg-[var(--color-accent)] text-white font-medium": providerFilter() === filter,
                          "bg-[var(--color-bg-raised)] text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] border border-[var(--color-border-subtle)]":
                            providerFilter() !== filter,
                        }}
                        onClick={() => setProviderFilter(filter)}
                      >
                        {filter === "ollama" ? "Ollama (Local)" : filter}
                      </button>
                    )}
                  </For>
                </div>

                <div class="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    class="text-[11px] text-[var(--color-accent)] hover:underline cursor-pointer disabled:opacity-40"
                    onClick={handleDiscoverOllama}
                    disabled={isFetchingRemote()}
                  >
                    Sync Ollama
                  </button>
                  <span class="text-[var(--color-fg-muted)]">•</span>
                  <button
                    type="button"
                    class="text-[11px] text-[var(--color-accent)] hover:underline cursor-pointer disabled:opacity-40"
                    onClick={handleDiscoverOpenRouter}
                    disabled={isFetchingRemote()}
                  >
                    Sync OpenRouter
                  </button>
                </div>
              </div>

              {/* Discovery & Key notice */}
              <Show when={discoverNotice()}>
                <div class="p-2.5 rounded bg-[var(--color-bg-raised)] border border-[var(--color-border)] text-xs text-[var(--color-fg-secondary)] flex items-center justify-between gap-3">
                  <div class="flex items-center gap-2 min-w-0">
                    <WarningIcon class="h-3.5 w-3.5 text-[var(--color-warning)] shrink-0" />
                    <span class="truncate">{discoverNotice()}</span>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      class="px-2.5 py-1 rounded bg-[var(--color-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-accent-hover)] cursor-pointer"
                      onClick={() => setModalTab("keys")}
                    >
                      Go to API Keys
                    </button>
                    <button
                      type="button"
                      class="text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] cursor-pointer p-0.5"
                      onClick={() => setDiscoverNotice(null)}
                    >
                      <CloseIcon class="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </Show>

              {/* Add Custom Model Form */}
              <Show when={showAddCustom()}>
                <form
                  onSubmit={handleAddCustomModel}
                  class="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-raised)] space-y-2.5"
                >
                  <div class="text-xs font-semibold text-[var(--color-fg-primary)]">
                    Add Custom Model (Cursor-style)
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <div>
                      <label class="text-[11px] text-[var(--color-fg-muted)] block mb-1">
                        Model ID (required)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. mistralai/codestral-2501"
                        required
                        class="w-full px-2.5 py-1 text-xs rounded bg-[var(--color-bg-editor)] border border-[var(--color-border-subtle)] text-[var(--color-fg-primary)] font-mono outline-none"
                        value={customModelId()}
                        onInput={(e) => setCustomModelId(e.currentTarget.value)}
                      />
                    </div>
                    <div>
                      <label class="text-[11px] text-[var(--color-fg-muted)] block mb-1">
                        Display Name (optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Codestral 2501"
                        class="w-full px-2.5 py-1 text-xs rounded bg-[var(--color-bg-editor)] border border-[var(--color-border-subtle)] text-[var(--color-fg-primary)] outline-none"
                        value={customModelName()}
                        onInput={(e) => setCustomModelName(e.currentTarget.value)}
                      />
                    </div>
                  </div>

                  <div class="grid grid-cols-3 gap-2 items-end">
                    <div>
                      <label class="text-[11px] text-[var(--color-fg-muted)] block mb-1">
                        Provider
                      </label>
                      <select
                        class="w-full px-2 py-1 text-xs rounded bg-[var(--color-bg-editor)] border border-[var(--color-border-subtle)] text-[var(--color-fg-primary)] outline-none"
                        value={customProvider()}
                        onChange={(e) => setCustomProvider(e.currentTarget.value as ModelProvider)}
                      >
                        <option value="openrouter">OpenRouter</option>
                        <option value="openai">OpenAI</option>
                        <option value="gemini">Google Gemini</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="ollama">Ollama (Local)</option>
                      </select>
                    </div>

                    <div>
                      <label class="text-[11px] text-[var(--color-fg-muted)] block mb-1">
                        Context Window
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 128k, 200k"
                        class="w-full px-2.5 py-1 text-xs rounded bg-[var(--color-bg-editor)] border border-[var(--color-border-subtle)] text-[var(--color-fg-primary)] font-mono outline-none"
                        value={customContext()}
                        onInput={(e) => setCustomContext(e.currentTarget.value)}
                      />
                    </div>

                    <div class="flex items-center gap-2">
                      <button
                        type="submit"
                        class="px-3.5 py-1.5 text-xs font-medium rounded bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] cursor-pointer"
                      >
                        Add & Enable
                      </button>
                      <button
                        type="button"
                        class="px-2.5 py-1.5 text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] cursor-pointer"
                        onClick={() => setShowAddCustom(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </form>
              </Show>
            </div>

            {/* Model Items List */}
            <div class="flex-1 overflow-y-auto p-3 space-y-2">
              <Show
                when={filteredModels().length > 0}
                fallback={
                  <div class="py-12 text-center text-xs text-[var(--color-fg-muted)]">
                    No models found matching your search.
                  </div>
                }
              >
                <For each={filteredModels()}>
                  {(model) => {
                    const isKeyReady = () => isProviderKeySet(model.provider);
                    return (
                      <div
                        class="px-3.5 py-2.5 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] flex items-center justify-between gap-4 transition-colors hover:border-[var(--color-border)]"
                        classList={{
                          "opacity-60": !model.enabled && isKeyReady(),
                          "border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5": !isKeyReady(),
                        }}
                      >
                        <div class="flex-1 min-w-0 space-y-1">
                          <div class="flex items-center gap-2">
                            <span class="text-xs font-semibold text-[var(--color-fg-primary)] truncate">
                              {model.name}
                            </span>
                            <span class="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[var(--color-bg-raised)] text-[var(--color-fg-secondary)] border border-[var(--color-border-subtle)]">
                              {model.provider}
                            </span>
                            <Show when={model.context}>
                              <span class="text-[10px] font-mono text-[var(--color-fg-muted)]">
                                {model.context}
                              </span>
                            </Show>
                            <Show
                              when={isKeyReady()}
                              fallback={
                                <button
                                  type="button"
                                  class="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-warning)]/15 text-[var(--color-warning)] border border-[var(--color-warning)]/40 hover:bg-[var(--color-warning)]/25 font-medium cursor-pointer flex items-center gap-1"
                                  onClick={() => {
                                    setSelectedProviderId(model.provider);
                                    setModalTab("keys");
                                  }}
                                  title="Click to configure API key"
                                >
                                  <span>⚠️ API Key Required</span>
                                </button>
                              }
                            >
                              <span class="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-success)]/15 text-[var(--color-success)] border border-[var(--color-success)]/30 font-medium">
                                ✓ Ready
                              </span>
                            </Show>
                          </div>
                          <div class="flex items-center gap-2 text-[11px] text-[var(--color-fg-muted)]">
                            <span class="font-mono text-[10px] text-[var(--color-fg-secondary)] truncate">
                              {model.id}
                            </span>
                            <Show when={model.description}>
                              <span>•</span>
                              <span class="truncate">{model.description}</span>
                            </Show>
                          </div>
                        </div>

                        {/* Right Action: Delete if custom + Cursor-Style Toggle Switch */}
                        <div class="flex items-center gap-3 shrink-0">
                          <Show when={model.isCustom}>
                            <button
                              type="button"
                              class="text-[11px] text-[var(--color-danger)] hover:underline cursor-pointer"
                              onClick={() => handleRemoveCustomModel(model.id)}
                              title="Remove custom model"
                            >
                              Delete
                            </button>
                          </Show>

                          {/* Cursor-style Toggle Switch */}
                          <Toggle
                            checked={model.enabled}
                            onChange={(val) => handleModelToggle(model.id, val)}
                            title={
                              isKeyReady()
                                ? model.enabled
                                  ? "Disable model"
                                  : "Enable model"
                                : "API key required to enable"
                            }
                          />
                        </div>
                      </div>
                    );
                  }}
                </For>
              </Show>
            </div>
          </div>
        </Show>

        {/* Footer */}
        <div class="h-10 px-5 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-raised)] flex items-center justify-between text-[11px] text-[var(--color-fg-muted)]">
          <div class="flex items-center gap-1.5">
            <KeyIcon class="h-3 w-3" />
            <span>Credentials stored in OS keychain with local fallback</span>
          </div>
          <button
            type="button"
            class="hover:text-[var(--color-fg-primary)] cursor-pointer text-xs font-medium"
            onClick={props.onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
