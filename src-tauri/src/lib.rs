pub mod apply;
pub mod editor_fs;
pub mod fs_jail;
pub mod llm;
pub mod search;
pub mod secrets;
pub mod shell;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use apply::{ApplyTransaction, TransactionManager};
use editor_fs::{EditorFs, FileNodeInfo};
use llm::{ChatMessage, LlmEvent, LlmService, LlmToolDefinition};
use reqwest::header::{HeaderMap, HeaderValue};
use search::SearchEngine;
use secrets::SecretManager;
use shell::ShellRunner;
use tauri::ipc::Channel;
use tauri::State;
use tokio_util::sync::CancellationToken;

pub struct AppState {
    pub llm: LlmService,
    pub tx_mgr: Mutex<TransactionManager>,
    pub active_streams: Mutex<HashMap<String, CancellationToken>>,
    pub project_root: Mutex<Option<String>>,
}

#[tauri::command]
async fn list_project_files(root: String, state: State<'_, Arc<AppState>>) -> Result<Vec<FileNodeInfo>, String> {
    {
        let mut p_root = state.project_root.lock().map_err(|_| "State lock poisoned")?;
        *p_root = Some(root.clone());
        let mut tx = state.tx_mgr.lock().map_err(|_| "Tx lock poisoned")?;
        *tx = TransactionManager::new(&root);
    }
    EditorFs::list_tree(&root)
}

#[tauri::command]
async fn read_file_content(path: String, state: State<'_, Arc<AppState>>) -> Result<String, String> {
    let root = state
        .project_root
        .lock()
        .map_err(|_| "State lock poisoned")?
        .clone()
        .unwrap_or_else(|| ".".into());
    EditorFs::read_file(&root, &path)
}

#[tauri::command]
async fn save_file_content(path: String, content: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let root = state
        .project_root
        .lock()
        .map_err(|_| "State lock poisoned")?
        .clone()
        .unwrap_or_else(|| ".".into());
    EditorFs::write_file(&root, &path, &content)
}

#[tauri::command]
async fn start_llm_stream(
    stream_id: String,
    provider: Option<String>,
    model: String,
    system: String,
    messages: Vec<ChatMessage>,
    tools: Vec<LlmToolDefinition>,
    channel: Channel<LlmEvent>,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let cancel = CancellationToken::new();
    {
        let mut streams = state.active_streams.lock().map_err(|_| "Active streams lock poisoned")?;
        streams.insert(stream_id.clone(), cancel.clone());
    }

    // Determine target provider explicitly or from model
    let target_provider = if let Some(ref p) = provider {
        p.to_lowercase()
    } else {
        let m = model.to_lowercase();
        if m.contains("claude") || m.contains("fable") || m.contains("mythos") {
            "anthropic".to_string()
        } else if m.contains("ollama") || m.contains("localhost") {
            "ollama".to_string()
        } else if m.contains("gemini") {
            "gemini".to_string()
        } else if m.contains("/") || m.contains("deepseek") || m.contains("qwen") || m.contains("kimi") || m.contains("glm") || m.contains("grok") || m.contains("leanstral") || m.contains("robostral") || m.contains("command-a") {
            "openrouter".to_string()
        } else {
            "openai".to_string()
        }
    };

    let state_clone = Arc::clone(&state);

    tokio::spawn(async move {
        match target_provider.as_str() {
            "anthropic" => {
                let api_key = SecretManager::get_key("anthropic").unwrap_or_default();
                if api_key.trim().is_empty() {
                    let _ = channel.send(LlmEvent::Error(
                        "Anthropic API key is not configured. Please open Settings (⚙) and add your API key.".into(),
                    ));
                    let _ = channel.send(LlmEvent::Done);
                    return;
                }
                let _ = state_clone
                    .llm
                    .stream_anthropic(&api_key, &model, &system, messages, tools, channel, cancel)
                    .await;
            }
            "openai" => {
                let api_key = SecretManager::get_key("openai").unwrap_or_default();
                if api_key.trim().is_empty() {
                    let _ = channel.send(LlmEvent::Error(
                        "OpenAI API key is not configured. Please open Settings (⚙) and add your API key.".into(),
                    ));
                    let _ = channel.send(LlmEvent::Done);
                    return;
                }
                let _ = state_clone
                    .llm
                    .stream_openai_compatible(
                        "https://api.openai.com/v1/chat/completions",
                        &api_key,
                        &model,
                        &system,
                        messages,
                        tools,
                        None,
                        channel,
                        cancel,
                    )
                    .await;
            }
            "openrouter" => {
                let api_key = SecretManager::get_key("openrouter").unwrap_or_default();
                if api_key.trim().is_empty() {
                    let _ = channel.send(LlmEvent::Error(
                        "OpenRouter API key is not configured. Please open Settings (⚙) and add your API key.".into(),
                    ));
                    let _ = channel.send(LlmEvent::Done);
                    return;
                }
                let mut headers = HeaderMap::new();
                headers.insert("HTTP-Referer", HeaderValue::from_static("https://yones.ide"));
                headers.insert("X-Title", HeaderValue::from_static("Yones IDE"));

                let _ = state_clone
                    .llm
                    .stream_openai_compatible(
                        "https://openrouter.ai/api/v1/chat/completions",
                        &api_key,
                        &model,
                        &system,
                        messages,
                        tools,
                        Some(headers),
                        channel,
                        cancel,
                    )
                    .await;
            }
            "gemini" => {
                let api_key = SecretManager::get_key("gemini").unwrap_or_default();
                if api_key.trim().is_empty() {
                    let _ = channel.send(LlmEvent::Error(
                        "Gemini API key is not configured. Please open Settings (⚙) and add your API key.".into(),
                    ));
                    let _ = channel.send(LlmEvent::Done);
                    return;
                }
                let resolved_model = if model.contains("3-8-flash") || model == "gemini-3-8-flash" {
                    "gemini-2.0-flash".to_string()
                } else if model.contains("cyber") {
                    "gemini-1.5-pro".to_string()
                } else {
                    model
                };
                let _ = state_clone
                    .llm
                    .stream_openai_compatible(
                        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
                        &api_key,
                        &resolved_model,
                        &system,
                        messages,
                        tools,
                        None,
                        channel,
                        cancel,
                    )
                    .await;
            }
            "ollama" => {
                let _ = state_clone
                    .llm
                    .stream_openai_compatible(
                        "http://localhost:11434/v1/chat/completions",
                        "",
                        &model,
                        &system,
                        messages,
                        tools,
                        None,
                        channel,
                        cancel,
                    )
                    .await;
            }
            unknown => {
                let _ = channel.send(LlmEvent::Error(format!(
                    "Unknown LLM provider '{}'. Supported providers: anthropic, openai, openrouter, gemini, ollama",
                    unknown
                )));
                let _ = channel.send(LlmEvent::Done);
            }
        }

        if let Ok(mut streams) = state_clone.active_streams.lock() {
            streams.remove(&stream_id);
        }
    });

    Ok(())
}

#[tauri::command]
fn get_all_api_keys_status() -> Vec<secrets::KeyStatus> {
    vec![
        SecretManager::get_status("anthropic"),
        SecretManager::get_status("openai"),
        SecretManager::get_status("openrouter"),
        SecretManager::get_status("gemini"),
    ]
}

#[tauri::command]
fn set_api_key(provider: String, key: String) -> Result<(), String> {
    SecretManager::set_key(&provider, &key)
}

#[tauri::command]
fn delete_api_key(provider: String) -> Result<(), String> {
    SecretManager::delete_key(&provider)
}

#[tauri::command]
async fn test_api_key(provider: String, key: Option<String>) -> Result<String, String> {
    let target_key = match key {
        Some(k) if !k.trim().is_empty() => k,
        _ => SecretManager::get_key(&provider)?,
    };
    SecretManager::test_provider_key(&provider, &target_key).await
}

#[tauri::command]
async fn abort_stream(stream_id: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let mut streams = state.active_streams.lock().map_err(|_| "Active streams lock poisoned")?;
    if let Some(token) = streams.remove(&stream_id) {
        token.cancel();
    }
    Ok(())
}

#[tauri::command]
async fn execute_agent_tool(
    name: String,
    args: serde_json::Value,
    state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    let root = state
        .project_root
        .lock()
        .map_err(|_| "State lock poisoned")?
        .clone()
        .unwrap_or_else(|| ".".into());

    match name.as_str() {
        "read_file" => {
            let path = args
                .get("path")
                .and_then(|p| p.as_str())
                .ok_or("Missing 'path' argument")?;
            let line_start = args.get("line_start").and_then(|l| l.as_u64()).map(|l| l as usize);
            let line_end = args.get("line_end").and_then(|l| l.as_u64()).map(|l| l as usize);

            let content = EditorFs::read_file(&root, path)?;
            if line_start.is_some() || line_end.is_some() {
                let start = line_start.unwrap_or(1).saturating_sub(1);
                let lines: Vec<&str> = content.lines().collect();
                let end = line_end.unwrap_or(lines.len()).min(lines.len());
                if start < lines.len() {
                    Ok(lines[start..end].join("\n"))
                } else {
                    Ok(String::new())
                }
            } else {
                Ok(content)
            }
        }
        "list_dir" => {
            let path = args.get("path").and_then(|p| p.as_str()).unwrap_or("");
            let recursive = args.get("recursive").and_then(|r| r.as_bool()).unwrap_or(true);
            let tree = EditorFs::list_dir_subset(&root, path, recursive)?;
            serde_json::to_string(&tree).map_err(|e| e.to_string())
        }
        "search" => {
            let query = args
                .get("query")
                .and_then(|q| q.as_str())
                .ok_or("Missing 'query' argument")?;
            let is_regex = args.get("is_regex").and_then(|r| r.as_bool()).unwrap_or(false);
            let matches = SearchEngine::search(&root, query, is_regex, 50)?;
            serde_json::to_string(&matches).map_err(|e| e.to_string())
        }
        "apply_diff" => {
            let tx: ApplyTransaction =
                serde_json::from_value(args).map_err(|e| format!("Invalid apply_diff payload: {}", e))?;
            let mut tx_mgr = state.tx_mgr.lock().map_err(|_| "Tx lock poisoned")?;
            tx_mgr.execute_transaction(tx).map_err(|e| e.to_string())?;
            Ok("Successfully applied diff transaction across files.".into())
        }
        "rollback_transaction" => {
            let tx_id = args
                .get("transaction_id")
                .and_then(|id| id.as_str())
                .or_else(|| args.get("id").and_then(|id| id.as_str()))
                .ok_or("Missing 'transaction_id' argument")?;
            let mut tx_mgr = state.tx_mgr.lock().map_err(|_| "Tx lock poisoned")?;
            tx_mgr.rollback_checkpoint(tx_id).map_err(|e| e.to_string())?;
            Ok(format!("Successfully rolled back transaction {}.", tx_id))
        }
        "run_command" => {
            let cmd = args
                .get("command")
                .and_then(|c| c.as_str())
                .ok_or("Missing 'command' argument")?;
            let raw_args = args
                .get("args")
                .and_then(|a| a.as_array())
                .cloned()
                .unwrap_or_default();
            let parsed_args: Vec<String> = raw_args
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect();
            ShellRunner::execute(&root, cmd, &parsed_args).await
        }
        _ => Err(format!("Unknown agent tool: {}", name)),
    }
}

#[tauri::command]
async fn fetch_provider_models(provider: String) -> Result<Vec<String>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;

    match provider.as_str() {
        "ollama" => {
            let res = client
                .get("http://localhost:11434/api/tags")
                .send()
                .await
                .map_err(|e| format!("Could not connect to Ollama: {}", e))?;
            let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
            let mut models = Vec::new();
            if let Some(arr) = json.get("models").and_then(|m| m.as_array()) {
                for item in arr {
                    if let Some(name) = item.get("name").and_then(|n| n.as_str()) {
                        models.push(name.to_string());
                    }
                }
            }
            Ok(models)
        }
        "openrouter" => {
            let res = client
                .get("https://openrouter.ai/api/v1/models")
                .send()
                .await
                .map_err(|e| format!("OpenRouter error: {}", e))?;
            let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
            let mut models = Vec::new();
            if let Some(arr) = json.get("data").and_then(|d| d.as_array()) {
                for item in arr.iter().take(40) {
                    if let Some(id) = item.get("id").and_then(|n| n.as_str()) {
                        models.push(id.to_string());
                    }
                }
            }
            Ok(models)
        }
        "openai" => {
            let key = SecretManager::get_key("openai").unwrap_or_default();
            if key.trim().is_empty() {
                return Err("OpenAI API key is not configured".into());
            }
            let res = client
                .get("https://api.openai.com/v1/models")
                .header("Authorization", format!("Bearer {}", key.trim()))
                .send()
                .await
                .map_err(|e| format!("OpenAI error: {}", e))?;
            let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
            let mut models = Vec::new();
            if let Some(arr) = json.get("data").and_then(|d| d.as_array()) {
                for item in arr {
                    if let Some(id) = item.get("id").and_then(|n| n.as_str()) {
                        if id.starts_with("gpt-") || id.starts_with("o1") || id.starts_with("o3") {
                            models.push(id.to_string());
                        }
                    }
                }
            }
            models.sort();
            Ok(models)
        }
        "gemini" => {
            let key = SecretManager::get_key("gemini").unwrap_or_default();
            if key.trim().is_empty() {
                return Err("Gemini API key is not configured".into());
            }
            let res = client
                .get(format!("https://generativelanguage.googleapis.com/v1beta/models?key={}", key.trim()))
                .send()
                .await
                .map_err(|e| format!("Gemini error: {}", e))?;
            let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
            let mut models = Vec::new();
            if let Some(arr) = json.get("models").and_then(|m| m.as_array()) {
                for item in arr {
                    if let Some(name) = item.get("name").and_then(|n| n.as_str()) {
                        let clean = name.strip_prefix("models/").unwrap_or(name);
                        models.push(clean.to_string());
                    }
                }
            }
            models.sort();
            Ok(models)
        }
        _ => Ok(vec![]),
    }
}

pub fn run() {
    let app_state = Arc::new(AppState {
        llm: LlmService::new(),
        tx_mgr: Mutex::new(TransactionManager::new(".")),
        active_streams: Mutex::new(HashMap::new()),
        project_root: Mutex::new(None),
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            list_project_files,
            read_file_content,
            save_file_content,
            start_llm_stream,
            abort_stream,
            execute_agent_tool,
            get_all_api_keys_status,
            set_api_key,
            delete_api_key,
            test_api_key,
            fetch_provider_models,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Yones IDE application");
}
