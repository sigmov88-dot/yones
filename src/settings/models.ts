import { invoke } from "@tauri-apps/api/core";

export type ModelProvider = "anthropic" | "openai" | "openrouter" | "gemini" | "ollama";

export interface ModelInfo {
  id: string;
  name: string;
  provider: ModelProvider;
  enabled: boolean;
  isCustom?: boolean;
  description?: string;
  context?: string;
}

export const DEFAULT_MODELS: ModelInfo[] = [
  // Anthropic Claude
  {
    id: "claude-3-7-sonnet-20250219",
    name: "Claude 3.7 Sonnet",
    provider: "anthropic",
    enabled: true,
    description: "Hybrid reasoning & premier coding model",
    context: "200k",
  },
  {
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    enabled: true,
    description: "State-of-the-art coding and agentic edits",
    context: "200k",
  },
  {
    id: "claude-3-5-haiku-20241022",
    name: "Claude 3.5 Haiku",
    provider: "anthropic",
    enabled: false,
    description: "Lightweight and ultra-fast",
    context: "200k",
  },

  // OpenAI
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    enabled: true,
    description: "Flagship versatile multimodal model",
    context: "128k",
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    enabled: true,
    description: "Fast, cost-efficient model for quick edits",
    context: "128k",
  },
  {
    id: "o3-mini",
    name: "o3-mini",
    provider: "openai",
    enabled: true,
    description: "High-speed reasoning model for coding",
    context: "200k",
  },
  {
    id: "o1",
    name: "o1",
    provider: "openai",
    enabled: false,
    description: "Deep reasoning model for complex architecture",
    context: "200k",
  },

  // Google Gemini
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "gemini",
    enabled: true,
    description: "Next-gen high speed and multi-tool support",
    context: "1M",
  },
  {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    provider: "gemini",
    enabled: false,
    description: "Deep comprehension with 2M token context window",
    context: "2M",
  },

  // OpenRouter
  {
    id: "deepseek/deepseek-r1",
    name: "DeepSeek R1",
    provider: "openrouter",
    enabled: true,
    description: "Top-tier open weights reasoning model",
    context: "64k",
  },
  {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek V3",
    provider: "openrouter",
    enabled: true,
    description: "Extremely cost-efficient high intelligence",
    context: "64k",
  },
  {
    id: "anthropic/claude-3.7-sonnet",
    name: "Claude 3.7 Sonnet (OpenRouter)",
    provider: "openrouter",
    enabled: false,
    description: "Claude via unified OpenRouter endpoint",
    context: "200k",
  },
  {
    id: "qwen/qwen-2.5-coder-32b-instruct",
    name: "Qwen 2.5 Coder 32B",
    provider: "openrouter",
    enabled: false,
    description: "Specialized open weights coding model",
    context: "32k",
  },

  // Ollama (Local)
  {
    id: "llama3.3",
    name: "Llama 3.3 (Local)",
    provider: "ollama",
    enabled: false,
    description: "Local model running via Ollama",
    context: "128k",
  },
  {
    id: "qwen2.5-coder:7b",
    name: "Qwen 2.5 Coder 7B (Local)",
    provider: "ollama",
    enabled: false,
    description: "Local coding model via Ollama",
    context: "32k",
  },
  {
    id: "deepseek-r1:14b",
    name: "DeepSeek R1 14B (Local)",
    provider: "ollama",
    enabled: false,
    description: "Local reasoning model via Ollama",
    context: "64k",
  },
];

const STORAGE_MODELS_KEY = "yones_models_registry";
const STORAGE_ACTIVE_MODEL_KEY = "yones_active_model_id";

let inMemoryModels: ModelInfo[] = [...DEFAULT_MODELS];
let inMemoryActiveId: string = "claude-3-7-sonnet-20250219";

export function loadModels(): ModelInfo[] {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(STORAGE_MODELS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ModelInfo[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Merge with any new default models
          const existingIds = new Set(parsed.map((m) => m.id));
          const missingDefaults = DEFAULT_MODELS.filter((m) => !existingIds.has(m.id));
          const merged = [...parsed, ...missingDefaults];
          inMemoryModels = merged;
          return merged;
        }
      }
    }
  } catch {
    // fallback
  }
  return inMemoryModels;
}

export function saveModels(models: ModelInfo[]): void {
  inMemoryModels = models;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_MODELS_KEY, JSON.stringify(models));
    }
  } catch {
    // fallback
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("yones-model-registry-updated"));
  }
}

export function toggleModel(modelId: string, enabled?: boolean): ModelInfo[] {
  const current = loadModels();
  const updated = current.map((m) => {
    if (m.id === modelId) {
      return { ...m, enabled: enabled !== undefined ? enabled : !m.enabled };
    }
    return m;
  });
  saveModels(updated);
  return updated;
}

export function addCustomModel(model: {
  id: string;
  name: string;
  provider: ModelProvider;
  context?: string;
  description?: string;
}): ModelInfo[] {
  const current = loadModels();
  if (current.some((m) => m.id === model.id)) {
    return current;
  }
  const newModel: ModelInfo = {
    ...model,
    enabled: true,
    isCustom: true,
  };
  const updated = [...current, newModel];
  saveModels(updated);
  return updated;
}

export function removeCustomModel(modelId: string): ModelInfo[] {
  const current = loadModels();
  const updated = current.filter((m) => m.id !== modelId || !m.isCustom);
  saveModels(updated);
  return updated;
}

export function getEnabledModels(): ModelInfo[] {
  const all = loadModels();
  const enabled = all.filter((m) => m.enabled);
  return enabled.length > 0 ? enabled : [DEFAULT_MODELS[0]];
}

export function getActiveModel(): ModelInfo {
  let activeId = inMemoryActiveId;
  try {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(STORAGE_ACTIVE_MODEL_KEY);
      if (stored) activeId = stored;
    }
  } catch {
    // ignore
  }

  const enabled = getEnabledModels();
  const found = enabled.find((m) => m.id === activeId);
  return found || enabled[0] || DEFAULT_MODELS[0];
}

export function setActiveModel(modelId: string): void {
  inMemoryActiveId = modelId;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_ACTIVE_MODEL_KEY, modelId);
    }
  } catch {
    // ignore
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("yones-active-model-changed", { detail: getActiveModel() })
    );
  }
}

export async function fetchRemoteModels(provider: ModelProvider): Promise<string[]> {
  try {
    return await invoke<string[]>("fetch_provider_models", { provider });
  } catch (err) {
    // Direct fetch fallback in web dev mode
    if (provider === "ollama") {
      try {
        const res = await fetch("http://localhost:11434/api/tags");
        if (res.ok) {
          const data = (await res.json()) as { models?: { name?: string }[] };
          return (data.models || []).map((m) => m.name || "").filter(Boolean);
        }
      } catch {
        // ignore
      }
    } else if (provider === "openrouter") {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/models");
        if (res.ok) {
          const data = (await res.json()) as { data?: { id?: string }[] };
          return (data.data || []).slice(0, 40).map((m) => m.id || "").filter(Boolean);
        }
      } catch {
        // ignore
      }
    }
    throw err;
  }
}
