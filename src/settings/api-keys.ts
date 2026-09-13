import { invoke } from "@tauri-apps/api/core";

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
    description: "Powers Yones code generation, agent tools, and inline edits (Claude 3.7 / 3.5 Sonnet).",
    placeholder: "sk-ant-api03-...",
    docsUrl: "https://console.anthropic.com/settings/keys",
    defaultModel: "claude-3-7-sonnet-20250219",
    prefix: "sk-ant-",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "Access GPT-4o, GPT-4.5, and OpenAI reasoning models.",
    placeholder: "sk-proj-...",
    docsUrl: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-4o",
    prefix: "sk-",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Unified API for DeepSeek R1, Llama 3.3, Claude, and open-weights models.",
    placeholder: "sk-or-v1-...",
    docsUrl: "https://openrouter.ai/keys",
    defaultModel: "anthropic/claude-3.7-sonnet",
    prefix: "sk-or-",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Access Gemini 2.0 Flash and Pro models with massive context windows.",
    placeholder: "AIzaSy...",
    docsUrl: "https://aistudio.google.com/app/apikey",
    defaultModel: "gemini-2.0-flash",
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
}

export async function removeApiKey(provider: string): Promise<void> {
  try {
    await invoke("delete_api_key", { provider });
  } catch {
    // Fallback for browser dev mode
    removeStorageItem(`yones_api_key_${provider}`);
  }
}

export async function testApiKey(provider: string, key?: string): Promise<string> {
  try {
    return await invoke<string>("test_api_key", { provider, key });
  } catch (err) {
    throw new Error(String(err));
  }
}
