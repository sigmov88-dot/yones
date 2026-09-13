import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_MODELS,
  loadModels,
  saveModels,
  toggleModel,
  addCustomModel,
  removeCustomModel,
  getEnabledModels,
  getActiveModel,
  setActiveModel,
  enableProviderModels,
  disableProviderModels,
} from "../../src/settings/models";

describe("Model Registry & Real September 2026 Models", () => {
  beforeEach(() => {
    // Reset to defaults
    saveModels([...DEFAULT_MODELS.map((m) => ({ ...m, enabled: false }))]);
    setActiveModel(null);
  });

  it("loads actual September 2026 models across all categories and providers", () => {
    const models = loadModels();
    expect(models.length).toBeGreaterThanOrEqual(15);

    const ids = new Set(models.map((m) => m.id));
    // 🚀 Frontier models
    expect(ids.has("gpt-6-astra")).toBe(true);
    expect(ids.has("claude-fable-5-1")).toBe(true);
    expect(ids.has("gemini-3.8-flash")).toBe(true);
    expect(ids.has("gemini-3.7-flash")).toBe(true);
    expect(ids.has("gemini-3.1-pro-preview")).toBe(true);
    expect(ids.has("gemini-3-flash-preview")).toBe(true);
    expect(ids.has("meta/muse-spark-1-3")).toBe(true);

    // 🇨🇳 SuperCLUE & open weights
    expect(ids.has("qwen/qwen3.8-max")).toBe(true);
    expect(ids.has("zhipu/glm-5.3")).toBe(true);
    expect(ids.has("moonshot/kimi-k3")).toBe(true);
    expect(ids.has("deepseek/deepseek-v4-pro")).toBe(true);
    expect(ids.has("deepseek/deepseek-v4-flash")).toBe(true);

    // 🧠 Specialized releases
    expect(ids.has("xai/grok-build-0-1")).toBe(true);
    expect(ids.has("xai/grok-4.3")).toBe(true);
    expect(ids.has("mistral/leanstral-1.5")).toBe(true);
    expect(ids.has("cohere/command-a-plus")).toBe(true);
  });

  it("starts with zero enabled models if user has not configured API keys", () => {
    const enabled = getEnabledModels();
    expect(enabled.length).toBe(0);

    const active = getActiveModel();
    expect(active).toBeNull();
  });

  it("toggles model enabled state cleanly like a Cursor switch", () => {
    const targetId = "gpt-6-astra";
    toggleModel(targetId, true);
    const afterEnable = loadModels().find((m) => m.id === targetId);
    expect(afterEnable?.enabled).toBe(true);

    toggleModel(targetId, false);
    const afterDisable = loadModels().find((m) => m.id === targetId);
    expect(afterDisable?.enabled).toBe(false);
  });

  it("enables provider models when API key is added and disables on removal", () => {
    enableProviderModels("anthropic", "claude-fable-5-1");

    const enabled = getEnabledModels();
    expect(enabled.length).toBeGreaterThan(0);
    const fable = enabled.find((m) => m.id === "claude-fable-5-1");
    expect(fable).toBeDefined();

    const active = getActiveModel();
    expect(active?.id).toBe("claude-fable-5-1");

    // Remove key -> disable provider models
    disableProviderModels("anthropic");
    const afterDisable = getEnabledModels().filter((m) => m.provider === "anthropic");
    expect(afterDisable.length).toBe(0);
  });

  it("supports adding and removing custom models", () => {
    const customId = "mistral/codestral-2501";
    addCustomModel({
      id: customId,
      name: "Codestral 2501",
      provider: "openrouter",
      context: "256k",
      description: "Custom user coding model",
    });

    const models = loadModels();
    const added = models.find((m) => m.id === customId);
    expect(added).toBeDefined();
    expect(added?.name).toBe("Codestral 2501");
    expect(added?.isCustom).toBe(true);
    expect(added?.enabled).toBe(true);

    const active = getActiveModel();
    expect(active?.id).toBe(customId);

    removeCustomModel(customId);
    const afterRemoval = loadModels().find((m) => m.id === customId);
    expect(afterRemoval).toBeUndefined();
  });
});
