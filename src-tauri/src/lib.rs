pub mod apply;
pub mod ast;
pub mod editor_fs;
pub mod fs_jail;
pub mod llm;
pub mod lsp;
pub mod search;
pub mod secrets;
pub mod shell;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use apply::{ApplyTransaction, TransactionManager};
use editor_fs::{EditorFs, FileNodeInfo};
use llm::{ChatMessage, LlmEvent, LlmService, LlmToolDefinition};
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
        let mut p_root = state.project_root.lock().unwrap();
        *p_root = Some(root.clone());
        let mut tx = state.tx_mgr.lock().unwrap();
        *tx = TransactionManager::new(&root);
    }
    EditorFs::list_tree(&root)
}

#[tauri::command]
async fn read_file_content(path: String, state: State<'_, Arc<AppState>>) -> Result<String, String> {
    let root = state
        .project_root
        .lock()
        .unwrap()
        .clone()
        .unwrap_or_else(|| ".".into());
    EditorFs::read_file(&root, &path)
}

#[tauri::command]
async fn save_file_content(path: String, content: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let root = state
        .project_root
        .lock()
        .unwrap()
        .clone()
        .unwrap_or_else(|| ".".into());
    EditorFs::write_file(&root, &path, &content)
}

#[tauri::command]
async fn start_llm_stream(
    stream_id: String,
    model: String,
    system: String,
    messages: Vec<ChatMessage>,
    tools: Vec<LlmToolDefinition>,
    channel: Channel<LlmEvent>,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let cancel = CancellationToken::new();
    {
        let mut streams = state.active_streams.lock().unwrap();
        streams.insert(stream_id.clone(), cancel.clone());
    }

    let is_anthropic = model.contains("claude") || (!model.contains("ollama") && !model.contains("gpt") && !model.contains("o1") && !model.contains("o3"));
    let state_clone = Arc::clone(&state);

    tokio::spawn(async move {
        if is_anthropic {
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
        } else if model.contains("ollama") {
            let _ = state_clone
                .llm
                .stream_openai("http://localhost:11434/v1/chat/completions", "", &model, &system, messages, channel, cancel)
                .await;
        } else {
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
                .stream_openai("", &api_key, &model, &system, messages, channel, cancel)
                .await;
        }

        let mut streams = state_clone.active_streams.lock().unwrap();
        streams.remove(&stream_id);
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
    let mut streams = state.active_streams.lock().unwrap();
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
        .unwrap()
        .clone()
        .unwrap_or_else(|| ".".into());

    match name.as_str() {
        "read_file" => {
            let path = args
                .get("path")
                .and_then(|p| p.as_str())
                .ok_or("Missing 'path' argument")?;
            EditorFs::read_file(&root, path)
        }
        "list_dir" => {
            let tree = EditorFs::list_tree(&root)?;
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
            let mut tx_mgr = state.tx_mgr.lock().unwrap();
            tx_mgr.execute_transaction(tx).map_err(|e| e.to_string())?;
            Ok("Successfully applied diff transaction across files.".into())
        }
        "rollback_transaction" => {
            let tx_id = args
                .get("transaction_id")
                .and_then(|id| id.as_str())
                .ok_or("Missing 'transaction_id' argument")?;
            let mut tx_mgr = state.tx_mgr.lock().unwrap();
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running Yones IDE application");
}
