use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use keyring::Entry;
use serde::{Deserialize, Serialize};

const SERVICE_NAME: &str = "com.yones.ide";

static IN_MEMORY_CACHE: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyStatus {
    pub provider: String,
    pub is_set: bool,
    pub masked: String,
    pub source: String,
}

pub struct SecretManager;

impl SecretManager {
    fn get_fallback_path() -> Option<PathBuf> {
        let base = std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .ok()?;
        Some(PathBuf::from(base).join(".yones").join("secrets.json"))
    }

    fn read_fallback_file() -> HashMap<String, String> {
        if let Some(path) = Self::get_fallback_path() {
            if path.exists() {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(map) = serde_json::from_str::<HashMap<String, String>>(&content) {
                        return map;
                    }
                }
            }
        }
        HashMap::new()
    }

    fn write_fallback_file(map: &HashMap<String, String>) {
        if let Some(path) = Self::get_fallback_path() {
            if let Some(parent) = path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            if let Ok(json) = serde_json::to_string_pretty(map) {
                let _ = fs::write(path, json);
            }
        }
    }

    pub fn get_key(provider: &str) -> Result<String, String> {
        // 1. Check in-memory cache
        {
            let mut cache = IN_MEMORY_CACHE.lock().unwrap();
            if let Some(ref map) = *cache {
                if let Some(val) = map.get(provider) {
                    if !val.trim().is_empty() {
                        return Ok(val.clone());
                    }
                }
            } else {
                let file_map = Self::read_fallback_file();
                *cache = Some(file_map);
            }
        }

        // 2. Check environment variables
        match provider {
            "anthropic" => {
                if let Ok(val) = std::env::var("ANTHROPIC_API_KEY") {
                    if !val.trim().is_empty() {
                        return Ok(val.trim().to_string());
                    }
                }
                if let Ok(val) = std::env::var("ANTHROPIC_AUTH_TOKEN") {
                    if !val.trim().is_empty() {
                        return Ok(val.trim().to_string());
                    }
                }
            }
            "openai" => {
                if let Ok(val) = std::env::var("OPENAI_API_KEY") {
                    if !val.trim().is_empty() {
                        return Ok(val.trim().to_string());
                    }
                }
            }
            "openrouter" => {
                if let Ok(val) = std::env::var("OPENROUTER_API_KEY") {
                    if !val.trim().is_empty() {
                        return Ok(val.trim().to_string());
                    }
                }
            }
            "gemini" => {
                if let Ok(val) = std::env::var("GEMINI_API_KEY") {
                    if !val.trim().is_empty() {
                        return Ok(val.trim().to_string());
                    }
                }
            }
            _ => {}
        }

        // 3. Check OS keyring
        if let Ok(entry) = Entry::new(SERVICE_NAME, provider) {
            if let Ok(pwd) = entry.get_password() {
                if !pwd.trim().is_empty() {
                    return Ok(pwd.trim().to_string());
                }
            }
        }

        // 4. Check fallback file
        let file_map = Self::read_fallback_file();
        if let Some(val) = file_map.get(provider) {
            if !val.trim().is_empty() {
                return Ok(val.trim().to_string());
            }
        }

        Err(format!("No API key found for provider '{}'", provider))
    }

    pub fn set_key(provider: &str, secret: &str) -> Result<(), String> {
        let trimmed = secret.trim();

        // 1. Update OS keyring
        if let Ok(entry) = Entry::new(SERVICE_NAME, provider) {
            let _ = entry.set_password(trimmed);
        }

        // 2. Update in-memory cache and fallback file
        {
            let mut cache = IN_MEMORY_CACHE.lock().unwrap();
            let mut map = cache.take().unwrap_or_else(Self::read_fallback_file);
            map.insert(provider.to_string(), trimmed.to_string());
            Self::write_fallback_file(&map);
            *cache = Some(map);
        }

        Ok(())
    }

    pub fn delete_key(provider: &str) -> Result<(), String> {
        // 1. Remove from OS keyring
        if let Ok(entry) = Entry::new(SERVICE_NAME, provider) {
            let _ = entry.delete_credential();
        }

        // 2. Remove from fallback file and cache
        {
            let mut cache = IN_MEMORY_CACHE.lock().unwrap();
            let mut map = cache.take().unwrap_or_else(Self::read_fallback_file);
            map.remove(provider);
            Self::write_fallback_file(&map);
            *cache = Some(map);
        }

        Ok(())
    }

    pub fn get_status(provider: &str) -> KeyStatus {
        let key_res = Self::get_key(provider);
        match key_res {
            Ok(key) if !key.trim().is_empty() => {
                let len = key.len();
                let masked = if len <= 8 {
                    "••••••••".to_string()
                } else {
                    let start = &key[..std::cmp::min(7, len)];
                    let end = &key[len.saturating_sub(4)..];
                    format!("{}...{}", start, end)
                };

                let source = if std::env::var(format!("{}_API_KEY", provider.to_uppercase())).is_ok() {
                    "environment".to_string()
                } else {
                    "keyring".to_string()
                };

                KeyStatus {
                    provider: provider.to_string(),
                    is_set: true,
                    masked,
                    source,
                }
            }
            _ => KeyStatus {
                provider: provider.to_string(),
                is_set: false,
                masked: String::new(),
                source: "none".to_string(),
            },
        }
    }

    pub async fn test_provider_key(provider: &str, key: &str) -> Result<String, String> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(8))
            .build()
            .map_err(|e| e.to_string())?;

        match provider {
            "anthropic" => {
                let res = client
                    .post("https://api.anthropic.com/v1/messages")
                    .header("x-api-key", key)
                    .header("anthropic-version", "2023-06-01")
                    .header("content-type", "application/json")
                    .json(&serde_json::json!({
                        "model": "claude-3-haiku-20240307",
                        "max_tokens": 1,
                        "messages": [{"role": "user", "content": "ping"}]
                    }))
                    .send()
                    .await
                    .map_err(|e| format!("Network error: {}", e))?;

                if res.status().is_success() {
                    Ok("Anthropic API key verified successfully.".into())
                } else {
                    let status = res.status();
                    let body = res.text().await.unwrap_or_default();
                    if status.as_u16() == 401 {
                        Err("Invalid Anthropic API Key (401 Unauthorized)".into())
                    } else {
                        Err(format!("Anthropic verification returned status {}: {}", status, body))
                    }
                }
            }
            "openai" => {
                let res = client
                    .get("https://api.openai.com/v1/models")
                    .header("Authorization", format!("Bearer {}", key))
                    .send()
                    .await
                    .map_err(|e| format!("Network error: {}", e))?;

                if res.status().is_success() {
                    Ok("OpenAI API key verified successfully.".into())
                } else {
                    let status = res.status();
                    if status.as_u16() == 401 {
                        Err("Invalid OpenAI API Key (401 Unauthorized)".into())
                    } else {
                        Err(format!("OpenAI verification returned status {}", status))
                    }
                }
            }
            "openrouter" => {
                let res = client
                    .get("https://openrouter.ai/api/v1/auth/key")
                    .header("Authorization", format!("Bearer {}", key))
                    .send()
                    .await
                    .map_err(|e| format!("Network error: {}", e))?;

                if res.status().is_success() {
                    Ok("OpenRouter API key verified successfully.".into())
                } else {
                    Err(format!("OpenRouter verification returned status {}", res.status()))
                }
            }
            "gemini" => {
                let url = format!(
                    "https://generativelanguage.googleapis.com/v1beta/models?key={}",
                    key
                );
                let res = client.get(&url).send().await.map_err(|e| format!("Network error: {}", e))?;
                if res.status().is_success() {
                    Ok("Google Gemini API key verified successfully.".into())
                } else {
                    Err(format!("Gemini verification returned status {}", res.status()))
                }
            }
            _ => Err(format!("Unsupported provider '{}'", provider)),
        }
    }
}
