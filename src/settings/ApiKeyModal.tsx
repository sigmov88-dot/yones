import { createSignal, onMount, For, Show } from "solid-js";
import {
  PROVIDER_CATALOG,
  fetchAllKeyStatuses,
  saveApiKey,
  removeApiKey,
  testApiKey,
  type KeyStatus,
} from "./api-keys";

export interface ApiKeyModalProps {
  onClose: () => void;
  onKeysUpdated?: () => void;
}

export function ApiKeyModal(props: ApiKeyModalProps) {
  const [statuses, setStatuses] = createSignal<KeyStatus[]>([]);
  const [selectedProviderId, setSelectedProviderId] = createSignal("anthropic");
  const [keyInput, setKeyInput] = createSignal("");
  const [showKey, setShowKey] = createSignal(false);
  const [isSaving, setIsSaving] = createSignal(false);
  const [isTesting, setIsTesting] = createSignal(false);
  const [testResult, setTestResult] = createSignal<{ success: boolean; message: string } | null>(null);

  const refreshStatuses = async () => {
    const list = await fetchAllKeyStatuses();
    setStatuses(list);
  };

  onMount(() => {
    void refreshStatuses();
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

  const handleSave = async () => {
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

  const handleRemove = async () => {
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

  const handleTest = async () => {
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

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      props.onClose();
    }
  };

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay)] p-4 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div class="w-full max-w-2xl rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-panel)] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div class="h-12 px-5 border-b border-[var(--color-border-subtle)] flex items-center justify-between bg-[var(--color-bg-raised)]">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-[var(--color-fg-primary)] tracking-wide">
              API Keys & Model Providers
            </span>
            <span class="text-[11px] px-2 py-0.5 rounded bg-[var(--color-bg-editor)] text-[var(--color-fg-secondary)] border border-[var(--color-border-subtle)]">
              BYOK
            </span>
          </div>
          <button
            type="button"
            class="text-base text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] cursor-pointer px-1.5 py-0.5 rounded"
            onClick={props.onClose}
          >
            &times;
          </button>
        </div>

        {/* Content Body: Two columns */}
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
                  Get API Key &nearr;
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
                    <span class="text-[var(--color-warning)] font-medium flex items-center gap-1">
                      <span>&bull;</span> Not configured
                    </span>
                  }
                >
                  <span class="text-[var(--color-success)] font-medium flex items-center gap-1">
                    <span>&#10003;</span> Active ({currentStatus()?.source})
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
                    onClick={handleRemove}
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
                  class="w-full px-3 py-2 pr-16 text-xs rounded-lg font-mono bg-[var(--color-bg-raised)] border border-[var(--color-border)] text-[var(--color-fg-primary)] placeholder-[var(--color-fg-muted)] outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent-ring)]"
                  value={keyInput()}
                  onInput={(e) => setKeyInput(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && keyInput().trim()) void handleSave();
                  }}
                />
                <button
                  type="button"
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] cursor-pointer px-1 py-0.5"
                  onClick={() => setShowKey((prev) => !prev)}
                >
                  {showKey() ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {/* Test connection & save actions */}
            <div class="flex items-center justify-between pt-2">
              <button
                type="button"
                class="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--color-bg-panel)] text-[var(--color-fg-secondary)] border border-[var(--color-border)] hover:bg-[var(--color-bg-raised)] hover:text-[var(--color-fg-primary)] cursor-pointer disabled:opacity-40"
                onClick={handleTest}
                disabled={isTesting() || (!keyInput().trim() && !currentStatus()?.is_set)}
              >
                {isTesting() ? "Testing connection..." : "Test Connection"}
              </button>

              <button
                type="button"
                class="px-4 py-1.5 text-xs font-medium rounded-lg bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] active:bg-[var(--color-accent-press)] cursor-pointer disabled:opacity-40"
                onClick={handleSave}
                disabled={isSaving() || !keyInput().trim()}
              >
                {isSaving() ? "Saving..." : "Save Key"}
              </button>
            </div>

            {/* Feedback notification */}
            <Show when={testResult()}>
              <div
                class="p-2.5 rounded-lg text-xs leading-relaxed border"
                classList={{
                  "bg-[var(--color-bg-panel)] border-[var(--color-success)] text-[var(--color-success)]":
                    !!testResult()?.success,
                  "bg-[var(--color-bg-panel)] border-[var(--color-danger)] text-[var(--color-danger)]":
                    !testResult()?.success,
                }}
              >
                {testResult()?.message}
              </div>
            </Show>
          </div>
        </div>

        {/* Security Footer */}
        <div class="p-3 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] text-[11px] text-[var(--color-fg-muted)] flex items-center justify-between">
          <span>
            Stored encrypted in OS Keyring. Keys are never sent to Yones servers.
          </span>
          <button
            type="button"
            class="px-3 py-1 rounded text-xs bg-[var(--color-bg-raised)] text-[var(--color-fg-primary)] border border-[var(--color-border)] hover:bg-[var(--color-bg-active)] cursor-pointer"
            onClick={props.onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
