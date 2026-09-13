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
  // 🚀 Google Gemini 3 & Frontier Models
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    provider: "gemini",
    enabled: false,
    description: "Top-tier agentic software engineering, multi-step problem solving and low latency",
    context: "1M",
    category: "frontier",
  },
  {
    id: "gemini-3.7-flash",
    name: "Gemini 3.7 Flash",
    provider: "gemini",
    enabled: false,
    description: "Hybrid reasoning and fast response model for complex coding workflows",
    context: "1M",
    category: "frontier",
  },
  {
    id: "gemini-3.6-flash",
    name: "Gemini 3.6 Flash",
    provider: "gemini",
    enabled: false,
    description: "Balanced speed and quality for code generation and analysis",
    context: "1M",
    category: "frontier",
  },
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    provider: "gemini",
    enabled: false,
    description: "High throughput, cost-efficient model for general developer tasks",
    context: "1M",
    category: "frontier",
  },
  {
    id: "gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash-Lite",
    provider: "gemini",
    enabled: false,
    description: "Ultra-fast lightweight reasoning model optimized for high-frequency requests",
    context: "1M",
    category: "frontier",
  },
  {
    id: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash-Lite",
    provider: "gemini",
    enabled: false,
    description: "Lightweight, low-latency model for instant edits and completions",
    context: "1M",
    category: "frontier",
  },
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro (Preview)",
    provider: "gemini",
    enabled: false,
    description: "Deep reasoning, vast 2M context and architecture-scale planning",
    context: "2M",
    category: "frontier",
  },
  {
    id: "gemini-3-flash-preview",
    name: "Gemini 3 Flash (Preview)",
    provider: "gemini",
    enabled: false,
    description: "Next-gen Gemini 3 preview model with cutting-edge multimodal intelligence",
    context: "1M",
    category: "frontier",
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash (Thinking)",
    provider: "gemini",
    enabled: false,
    description: "Frontier reasoning & agentic software engineering with adaptive thinking",
    context: "1M",
    category: "frontier",
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "gemini",
    enabled: false,
    description: "Google's fast multimodal model with native tool use and low latency",
    context: "1M",
    category: "frontier",
  },
  {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    provider: "gemini",
    enabled: false,
    description: "Massive 2M token context window for repo-wide analysis and architecture",
    context: "2M",
    category: "frontier",
  },
  {
    id: "gemini-1.5-flash",
    name: "Gemini 1.5 Flash",
    provider: "gemini",
    enabled: false,
    description: "Lightweight, high-speed multimodal model with 1M context",
    context: "1M",
    category: "frontier",
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    enabled: false,
    description: "High-intelligence flagship omni model for complex coding and analysis",
    context: "128k",
    category: "frontier",
  },
  {
    id: "o3-mini",
    name: "o3-mini (Reasoning)",
    provider: "openai",
    enabled: false,
    description: "STEM and coding specialist with visible reasoning chain and low latency",
    context: "200k",
    category: "frontier",
  },
  {
    id: "gpt-6-astra",
    name: "GPT-6 Astra (Preview)",
    provider: "openai",
    enabled: false,
    description: "Flagship autonomous agent for multi-step tasks (auto-mapped to OpenAI reasoning/omni)",
    context: "256k",
    category: "frontier",
  },
  {
    id: "claude-3-7-sonnet-20250219",
    name: "Claude 3.7 Sonnet (Thinking)",
    provider: "anthropic",
    enabled: false,
    description: "Hybrid reasoning and coding model with extended thinking capabilities",
    context: "200k",
    category: "frontier",
  },
  {
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    enabled: false,
    description: "Industry standard for code generation and agentic tool use",
    context: "200k",
    category: "frontier",
  },
  {
    id: "claude-fable-5-1",
    name: "Claude Fable 5.1 (Preview)",
    provider: "anthropic",
    enabled: false,
    description: "Premier coding & long-horizon reasoning (auto-mapped to Claude 3.7 Sonnet)",
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
          // Normalize legacy IDs (e.g. gemini-3-8-flash -> gemini-3.8-flash)
          const migrated = parsed.map((m) => {
            if (m.id === "gemini-3-8-flash") return { ...m, id: "gemini-3.8-flash", name: "Gemini 3.8 Flash" };
            return m;
          });
          const existingIds = new Set(migrated.map((m) => m.id));
          const missingDefaults = DEFAULT_MODELS.filter((m) => !existingIds.has(m.id));
          const merged = [...migrated, ...missingDefaults];
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

  if (activeId === "gemini-3-8-flash") {
    activeId = "gemini-3.8-flash";
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
    if (provider === "gemini") {
      try {
        const apiKey = typeof localStorage !== "undefined" ? localStorage.getItem("yones_api_key_gemini") : null;
        if (apiKey) {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}`);
          if (res.ok) {
            const data = (await res.json()) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
            return (data.models || [])
              .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
              .map((m) => (m.name || "").replace(/^models\//, ""))
              .filter(Boolean);
          }
        }
      } catch {
        // ignore
      }
    } else if (provider === "openai") {
      try {
        const apiKey = typeof localStorage !== "undefined" ? localStorage.getItem("yones_api_key_openai") : null;
        if (apiKey) {
          const res = await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${apiKey.trim()}` },
          });
          if (res.ok) {
            const data = (await res.json()) as { data?: { id?: string }[] };
            return (data.data || [])
              .map((m) => m.id || "")
              .filter((id) => id.startsWith("gpt-") || id.startsWith("o1") || id.startsWith("o3"))
              .sort();
          }
        }
      } catch {
        // ignore
      }
    } else if (provider === "ollama") {
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
