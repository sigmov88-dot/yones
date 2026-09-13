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
  category?: "frontier" | "china_superclue" | "specialized" | "local";
}

export const DEFAULT_MODELS: ModelInfo[] = [
  // 🚀 Top Frontier Models (September 2026)
  {
    id: "gpt-6-astra",
    name: "GPT-6 Astra",
    provider: "openai",
    enabled: false,
    description: "Flagship autonomous agent for multi-step tasks, research, code & cybersec",
    context: "256k",
    category: "frontier",
  },
  {
    id: "claude-fable-5-1",
    name: "Claude Fable 5.1",
    provider: "anthropic",
    enabled: false,
    description: "Premier coding & long-horizon reasoning, self-verifying autonomous agent",
    context: "500k",
    category: "frontier",
  },
  {
    id: "claude-mythos-5-1",
    name: "Claude Mythos 5.1",
    provider: "anthropic",
    enabled: false,
    description: "Deep research & cybersecurity evaluation tier",
    context: "500k",
    category: "frontier",
  },
  {
    id: "gemini-3-8-flash",
    name: "Gemini 3.8 Flash",
    provider: "gemini",
    enabled: false,
    description: "Agentic software engineering with top benchmarks in long-horizon dev tasks",
    context: "1M",
    category: "frontier",
  },
  {
    id: "gemini-3-8-flash-cyber",
    name: "Gemini 3.8 Flash Cyber",
    provider: "gemini",
    enabled: false,
    description: "Cybersecurity specialist for vulnerability finding and patching",
    context: "1M",
    category: "frontier",
  },
  {
    id: "meta/muse-spark-1-3",
    name: "Muse Spark 1.3",
    provider: "openrouter",
    enabled: false,
    description: "Coding & agent reasoning with interactive clarification on ambiguous prompts",
    context: "128k",
    category: "frontier",
  },

  // 🇨🇳 Top Open Weights & SuperCLUE Models (Aug–Sept 2026)
  {
    id: "qwen/qwen3.8-max",
    name: "Qwen3.8-Max",
    provider: "openrouter",
    enabled: false,
    description: "SuperCLUE #1 Sept 2026 flagship with massive context & multimodal logic",
    context: "1M",
    category: "china_superclue",
  },
  {
    id: "zhipu/glm-5.3",
    name: "GLM-5.3",
    provider: "openrouter",
    enabled: false,
    description: "Advanced planning and strict instruction adherence in code workflows",
    context: "256k",
    category: "china_superclue",
  },
  {
    id: "moonshot/kimi-k3",
    name: "Kimi K3",
    provider: "openrouter",
    enabled: false,
    description: "2.8T parameters flagship open-weights agent model",
    context: "512k",
    category: "china_superclue",
  },
  {
    id: "deepseek/deepseek-v4-pro",
    name: "DeepSeek-V4-Pro",
    provider: "openrouter",
    enabled: false,
    description: "High-tier architecture & reasoning coding model at low cost",
    context: "256k",
    category: "china_superclue",
  },
  {
    id: "deepseek/deepseek-v4-flash",
    name: "DeepSeek-V4-Flash",
    provider: "openrouter",
    enabled: false,
    description: "Ultra-fast, lowest-cost production model for everyday coding",
    context: "128k",
    category: "china_superclue",
  },

  // 🧠 Specialized & Code Verification Releases
  {
    id: "xai/grok-build-0-1",
    name: "Grok Build 0.1",
    provider: "openrouter",
    enabled: false,
    description: "Dedicated agentic programming and system architecture model",
    context: "256k",
    category: "specialized",
  },
  {
    id: "xai/grok-4.3",
    name: "Grok 4.3",
    provider: "openrouter",
    enabled: false,
    description: "Cost-efficient reasoning flagship model",
    context: "256k",
    category: "specialized",
  },
  {
    id: "mistral/leanstral-1.5",
    name: "Leanstral 1.5",
    provider: "openrouter",
    enabled: false,
    description: "Formal code verification and logic proof model",
    context: "128k",
    category: "specialized",
  },
  {
    id: "mistral/robostral-navigate",
    name: "Robostral Navigate",
    provider: "openrouter",
    enabled: false,
    description: "Spatial reasoning and robot navigation logic",
    context: "64k",
    category: "specialized",
  },
  {
    id: "cohere/command-a-plus",
    name: "Command A+",
    provider: "openrouter",
    enabled: false,
    description: "Open weights model optimized for on-prem enterprise clusters (2x H100)",
    context: "256k",
    category: "specialized",
  },

  // 🔌 Local Ollama Models (http://localhost:11434)
  {
    id: "kimi-k3:latest",
    name: "Kimi K3 (Local)",
    provider: "ollama",
    enabled: false,
    description: "Local 2.8T open-weights model via Ollama",
    context: "128k",
    category: "local",
  },
  {
    id: "deepseek-v4-flash:latest",
    name: "DeepSeek-V4-Flash (Local)",
    provider: "ollama",
    enabled: false,
    description: "Local high-efficiency reasoning via Ollama",
    context: "64k",
    category: "local",
  },
  {
    id: "qwen3.8-max:latest",
    name: "Qwen3.8-Max (Local)",
    provider: "ollama",
    enabled: false,
    description: "Local flagship multimodal reasoning via Ollama",
    context: "128k",
    category: "local",
  },
];

const STORAGE_MODELS_KEY = "yones_models_registry_v2026_09";
const STORAGE_ACTIVE_MODEL_KEY = "yones_active_model_id_v2026_09";

let inMemoryModels: ModelInfo[] = [...DEFAULT_MODELS];
let inMemoryActiveId: string | null = null;

export function loadModels(): ModelInfo[] {
  try {
    if (typeof localStorage !== "undefined") {
      // Clean legacy keys if present
      localStorage.removeItem("yones_models_registry");
      localStorage.removeItem("yones_active_model_id");

      const raw = localStorage.getItem(STORAGE_MODELS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ModelInfo[];
        if (Array.isArray(parsed) && parsed.length > 0) {
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

  // If active model was just disabled, fallback to next enabled model or null
  const active = getActiveModel();
  if (!active || active.id === modelId && enabled === false) {
    const nextEnabled = updated.filter((m) => m.enabled)[0] ?? null;
    setActiveModel(nextEnabled ? nextEnabled.id : null);
  }

  return updated;
}

export function enableProviderModels(provider: ModelProvider, defaultModelId?: string): ModelInfo[] {
  const current = loadModels();
  let targetId = defaultModelId;
  if (!targetId) {
    const found = current.find((m) => m.provider === provider);
    targetId = found?.id;
  }

  const updated = current.map((m) => {
    if (m.provider === provider) {
      if (m.id === targetId) {
        return { ...m, enabled: true };
      }
    }
    return m;
  });

  saveModels(updated);

  // If no model currently active, set the default for this newly enabled provider
  const currentActive = getActiveModel();
  if (!currentActive && targetId) {
    setActiveModel(targetId);
  }

  return updated;
}

export function disableProviderModels(provider: ModelProvider): ModelInfo[] {
  const current = loadModels();
  const updated = current.map((m) => {
    if (m.provider === provider) {
      return { ...m, enabled: false };
    }
    return m;
  });

  saveModels(updated);

  const active = getActiveModel();
  if (active && active.provider === provider) {
    const nextEnabled = updated.filter((m) => m.enabled)[0] ?? null;
    setActiveModel(nextEnabled ? nextEnabled.id : null);
  }

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

  // Activate custom model immediately
  setActiveModel(newModel.id);
  return updated;
}

export function removeCustomModel(modelId: string): ModelInfo[] {
  const current = loadModels();
  const updated = current.filter((m) => m.id !== modelId || !m.isCustom);
  saveModels(updated);

  const active = getActiveModel();
  if (active?.id === modelId) {
    const nextEnabled = updated.filter((m) => m.enabled)[0] ?? null;
    setActiveModel(nextEnabled ? nextEnabled.id : null);
  }

  return updated;
}

export function getEnabledModels(): ModelInfo[] {
  const all = loadModels();
  return all.filter((m) => m.enabled);
}

export function getActiveModel(): ModelInfo | null {
  const enabled = getEnabledModels();
  if (enabled.length === 0) {
    return null;
  }

  let activeId = inMemoryActiveId;
  try {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(STORAGE_ACTIVE_MODEL_KEY);
      if (stored) activeId = stored;
    }
  } catch {
    // ignore
  }

  if (activeId) {
    const found = enabled.find((m) => m.id === activeId);
    if (found) return found;
  }

  return enabled[0] || null;
}

export function setActiveModel(modelId: string | null): void {
  inMemoryActiveId = modelId;
  try {
    if (typeof localStorage !== "undefined") {
      if (modelId) {
        localStorage.setItem(STORAGE_ACTIVE_MODEL_KEY, modelId);
      } else {
        localStorage.removeItem(STORAGE_ACTIVE_MODEL_KEY);
      }
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
