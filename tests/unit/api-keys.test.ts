import { describe, it, expect, beforeEach } from "vitest";
import {
  PROVIDER_CATALOG,
  fetchAllKeyStatuses,
  saveApiKey,
  removeApiKey,
  clearMemoryStorage,
} from "../../src/settings/api-keys";

describe("API Key Management & Catalog", () => {
  beforeEach(() => {
    clearMemoryStorage();
  });

  it("contains valid metadata for all primary model providers", () => {
    const ids = PROVIDER_CATALOG.map((p) => p.id);
    expect(ids).toContain("anthropic");
    expect(ids).toContain("openai");
    expect(ids).toContain("openrouter");
    expect(ids).toContain("gemini");

    for (const provider of PROVIDER_CATALOG) {
      expect(provider.name).toBeTruthy();
      expect(provider.docsUrl).toMatch(/^https:\/\//);
      expect(provider.defaultModel).toBeTruthy();
    }
  });

  it("stores and fetches API key in fallback storage when outside Tauri", async () => {
    await saveApiKey("anthropic", "sk-ant-test-key-12345");
    const statuses = await fetchAllKeyStatuses();
    const anthropicStatus = statuses.find((s) => s.provider === "anthropic");

    expect(anthropicStatus).toBeDefined();
    expect(anthropicStatus?.is_set).toBe(true);
    expect(anthropicStatus?.masked).toContain("sk-ant-");

    await removeApiKey("anthropic");
    const updatedStatuses = await fetchAllKeyStatuses();
    const removedStatus = updatedStatuses.find((s) => s.provider === "anthropic");
    expect(removedStatus?.is_set).toBe(false);
  });
});
