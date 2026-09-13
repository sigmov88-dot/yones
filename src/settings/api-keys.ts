import { invoke } from "@tauri-apps/api/core";
import {
  enableProviderModels,
  disableProviderModels,
  type ModelProvider,
} from "./models";

export interface KeyStatus {
  provider: string;
  is_set: boolean;
  masked: string;
  source: string;
}

export interface ProviderMeta {
  id: string;
  name: string;
  description: string;
  placeholder: string;
  docsUrl: string;
  defaultModel: string;
  prefix: string;
}

export const PROVIDER_CATALOG: ProviderMeta[] = [
  {
    id: "anthropic",
    name: "Anthropic Claude",
    description: "Powers coding, self-verifying agent workflows, and long-horizon tasks (Claude Fable 5.1, Claude Mythos 5.1).",
    placeholder: "sk-ant-api03-...",
    docsUrl: "https://console.anthropic.com/settings/keys",
    defaultModel: "claude-fable-5-1",
    prefix: "sk-ant-",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "Autonomous agent execution, multi-step research, code & cybersecurity (GPT-6 Astra).",
    placeholder: "sk-proj-...",
    docsUrl: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-6-astra",
    prefix: "sk-",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Unified gateway for frontier & SuperCLUE models (Qwen3.8-Max, GLM-5.3, Kimi K3, DeepSeek-V4, Grok 4.3).",
    placeholder: "sk-or-v1-...",
    docsUrl: "https://openrouter.ai/keys",
    defaultModel: "deepseek/deepseek-v4-pro",
    prefix: "sk-or-",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Agentic software engineering and vulnerability analysis (Gemini 3.8 Flash, 3.8 Flash Cyber).",
    placeholder: "AIzaSy...",
    docsUrl: "https://aistudio.google.com/app/apikey",
    defaultModel: "gemini-3-8-flash",
    prefix: "AIza",
  },
];

const memoryStore = new Map<string, string>();

function getStorageItem(key: string): string | null {
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(key);
    }
  } catch {
    // ignore
  }
  return memoryStore.get(key) ?? null;
}

function setStorageItem(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
    }
  } catch {
    // ignore
  }
  memoryStore.set(key, value);
}

function removeStorageItem(key: string): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
  memoryStore.delete(key);
}

export function clearMemoryStorage(): void {
  memoryStore.clear();
}

export function isProviderKeyConfiguredSync(providerId: string): boolean {
  if (providerId === "ollama") return true; // Ollama is local, does not require an API key
  const stored = getStorageItem(`yones_api_key_${providerId}`);
  return !!(stored && stored.trim().length > 0);
}

export function isAnyKeyConfiguredSync(): boolean {
  return PROVIDER_CATALOG.some((p) => isProviderKeyConfiguredSync(p.id));
}

export async function fetchAllKeyStatuses(): Promise<KeyStatus[]> {
  try {
    return await invoke<KeyStatus[]>("get_all_api_keys_status");
  } catch {
    // Fallback for browser dev mode & headless testing
    return PROVIDER_CATALOG.map((p) => {
      const stored = getStorageItem(`yones_api_key_${p.id}`);
      if (stored) {
        return {
          provider: p.id,
          is_set: true,
          masked: stored.length > 8 ? `${stored.slice(0, 7)}...${stored.slice(-4)}` : "••••••••",
          source: "local-storage",
        };
      }
      return {
        provider: p.id,
        is_set: false,
        masked: "",
        source: "none",
      };
    });
  }
}

export async function saveApiKey(provider: string, key: string): Promise<void> {
  const trimmed = key.trim();
  try {
    await invoke("set_api_key", { provider, key: trimmed });
  } catch {
    // Fallback for browser dev mode
    setStorageItem(`yones_api_key_${provider}`, trimmed);
  }

  // Automatically enable primary model for this provider
  const defaultModel = PROVIDER_CATALOG.find((p) => p.id === provider)?.defaultModel;
  enableProviderModels(provider as ModelProvider, defaultModel);
}

export async function removeApiKey(provider: string): Promise<void> {
  try {
    await invoke("delete_api_key", { provider });
  } catch {
    // Fallback for browser dev mode
    removeStorageItem(`yones_api_key_${provider}`);
  }

  // Automatically disable models for this provider
  disableProviderModels(provider as ModelProvider);
}

export async function testApiKey(provider: string, key?: string): Promise<string> {
  try {
    return await invoke<string>("test_api_key", { provider, key });
  } catch (err) {
    throw new Error(String(err));
  }
}
