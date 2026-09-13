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
} from "../../src/settings/models";

describe("Model Registry & Cursor-style Toggle Management", () => {
  beforeEach(() => {
    // Reset to default models
    saveModels([...DEFAULT_MODELS]);
    setActiveModel("claude-3-7-sonnet-20250219");
  });

  it("loads curated defaults across all 5 supported providers", () => {
    const models = loadModels();
    expect(models.length).toBeGreaterThanOrEqual(10);

    const providers = new Set(models.map((m) => m.provider));
    expect(providers.has("anthropic")).toBe(true);
    expect(providers.has("openai")).toBe(true);
    expect(providers.has("openrouter")).toBe(true);
    expect(providers.has("gemini")).toBe(true);
    expect(providers.has("ollama")).toBe(true);
  });

  it("toggles model enabled state like a switch", () => {
    const targetId = "claude-3-5-haiku-20241022";
    const initial = loadModels().find((m) => m.id === targetId);
    expect(initial?.enabled).toBe(false);

    // Toggle ON
    toggleModel(targetId, true);
    const afterEnable = loadModels().find((m) => m.id === targetId);
    expect(afterEnable?.enabled).toBe(true);

    // Toggle OFF
    toggleModel(targetId, false);
    const afterDisable = loadModels().find((m) => m.id === targetId);
    expect(afterDisable?.enabled).toBe(false);
  });

  it("returns only enabled models in getEnabledModels()", () => {
    const enabled = getEnabledModels();
    expect(enabled.length).toBeGreaterThan(0);
    for (const m of enabled) {
      expect(m.enabled).toBe(true);
    }
  });

  it("supports adding and removing custom models", () => {
    const customId = "mistralai/mistral-large-2407";
    addCustomModel({
      id: customId,
      name: "Mistral Large 2",
      provider: "openrouter",
      context: "128k",
      description: "Top open model",
    });

    const models = loadModels();
    const added = models.find((m) => m.id === customId);
    expect(added).toBeDefined();
    expect(added?.name).toBe("Mistral Large 2");
    expect(added?.isCustom).toBe(true);
    expect(added?.enabled).toBe(true);

    // Remove custom model
    removeCustomModel(customId);
    const afterRemoval = loadModels().find((m) => m.id === customId);
    expect(afterRemoval).toBeUndefined();
  });

  it("gets and sets active model correctly", () => {
    setActiveModel("gpt-4o");
    const active = getActiveModel();
    expect(active.id).toBe("gpt-4o");
    expect(active.provider).toBe("openai");
  });

  it("falls back to first enabled model if active model is disabled", () => {
    // Disable gpt-4o
    toggleModel("gpt-4o", false);
    setActiveModel("gpt-4o");

    const active = getActiveModel();
    // Since gpt-4o is disabled, getActiveModel() must fallback to an enabled model
    expect(active.enabled).toBe(true);
    expect(active.id).not.toBe("gpt-4o");
  });
});
