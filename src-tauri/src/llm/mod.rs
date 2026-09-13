use std::collections::HashMap;
use std::time::Duration;
use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum LlmEvent {
    TextDelta(String),
    ToolCall { id: String, name: String, arguments: String },
    ToolResult { id: String, result: String },
    Usage { input_tokens: u32, output_tokens: u32, cost_usd: f64 },
    Done,
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

pub struct LlmService {
    client: reqwest::Client,
}

impl LlmService {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(10))
                .tcp_nodelay(true)
                .build()
                .unwrap_or_default(),
        }
    }

    pub fn calculate_cost(model: &str, in_tok: u32, out_tok: u32) -> f64 {
        let m = model.to_lowercase();
        if m.contains("ollama") || m.contains("localhost") {
            return 0.0;
        }

        let (in_rate, out_rate) = if m.contains("fable") || m.contains("mythos") || m.contains("claude") {
            (3.0, 15.0)
        } else if m.contains("gpt-6") || m.contains("astra") || m.contains("gpt") || m.contains("o1") || m.contains("o3") {
            (2.5, 10.0)
        } else if m.contains("flash") && (m.contains("deepseek") || m.contains("v4-flash")) {
            (0.10, 0.40)
        } else if m.contains("gemini") {
            (0.15, 0.60)
        } else if m.contains("deepseek") {
            (0.50, 2.0)
        } else if m.contains("qwen") || m.contains("kimi") || m.contains("glm") {
            (1.0, 4.0)
        } else {
            (1.5, 6.0)
        };

        ((in_tok as f64) * in_rate + (out_tok as f64) * out_rate) / 1_000_000.0
    }

    pub async fn stream_anthropic(
        &self,
        api_key: &str,
        model: &str,
        system: &str,
        messages: Vec<ChatMessage>,
        tools: Vec<LlmToolDefinition>,
        channel: Channel<LlmEvent>,
        cancel: CancellationToken,
    ) -> Result<(), String> {
        let mut headers = HeaderMap::new();
        headers.insert("x-api-key", HeaderValue::from_str(api_key).map_err(|e| e.to_string())?);
        headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let anthropic_tools: Vec<serde_json::Value> = tools
            .iter()
            .map(|t| {
                serde_json::json!({
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.parameters
                })
            })
            .collect();

        let mut payload = serde_json::json!({
            "model": model,
            "max_tokens": 4096,
            "system": system,
            "messages": messages,
            "stream": true
        });

        if !anthropic_tools.is_empty() {
            payload["tools"] = serde_json::json!(anthropic_tools);
        }

        let mut backoff = Duration::from_millis(500);
        let mut response = None;

        for attempt in 0..4 {
            tokio::select! {
                _ = cancel.cancelled() => {
                    let _ = channel.send(LlmEvent::Done);
                    return Ok(());
                }
                res = self.client.post("https://api.anthropic.com/v1/messages")
                    .headers(headers.clone())
                    .json(&payload)
                    .send() => {
                    match res {
                        Ok(resp) if resp.status().is_success() => {
                            response = Some(resp);
                            break;
                        }
                        Ok(resp) if (resp.status().as_u16() == 429 || resp.status().is_server_error()) && attempt < 3 => {
                            tokio::time::sleep(backoff).await;
                            backoff *= 2;
                        }
                        Ok(resp) => {
                            let status = resp.status();
                            let text = resp.text().await.unwrap_or_default();
                            let _ = channel.send(LlmEvent::Error(format!("Anthropic API {}: {}", status, text)));
                            return Err(format!("API error {}", status));
                        }
                        Err(_err) if attempt < 3 => {
                            tokio::time::sleep(backoff).await;
                            backoff *= 2;
                        }
                        Err(err) => {
                            let _ = channel.send(LlmEvent::Error(err.to_string()));
                            return Err(err.to_string());
                        }
                    }
                }
            }
        }

        let resp = match response {
            Some(r) => r,
            None => {
                let _ = channel.send(LlmEvent::Error("Max retries exceeded".into()));
                return Err("Retries exceeded".into());
            }
        };

        let mut stream = resp.bytes_stream();
        let mut buffer = String::new();
        let mut active_tools: HashMap<usize, (String, String, String)> = HashMap::new();
        let mut input_tokens = 0u32;
        let mut output_tokens = 0u32;

        loop {
            tokio::select! {
                _ = cancel.cancelled() => {
                    let _ = channel.send(LlmEvent::Done);
                    return Ok(());
                }
                item = stream.next() => {
                    match item {
                        Some(Ok(bytes)) => {
                            if let Ok(chunk) = std::str::from_utf8(&bytes) {
                                buffer.push_str(chunk);
                                while let Some(pos) = buffer.find("\n\n") {
                                    let sse_event = buffer[..pos].to_string();
                                    buffer.drain(..pos + 2);
                                    Self::process_anthropic_sse(
                                        &sse_event,
                                        &channel,
                                        &mut active_tools,
                                        &mut input_tokens,
                                        &mut output_tokens,
                                        model,
                                    );
                                }
                            }
                        }
                        Some(Err(e)) => {
                            let _ = channel.send(LlmEvent::Error(e.to_string()));
                            break;
                        }
                        None => {
                            let _ = channel.send(LlmEvent::Done);
                            break;
                        }
                    }
                }
            }
        }

        Ok(())
    }

    pub async fn stream_openai_compatible(
        &self,
        endpoint: &str,
        api_key: &str,
        model: &str,
        system: &str,
        messages: Vec<ChatMessage>,
        tools: Vec<LlmToolDefinition>,
        extra_headers: Option<HeaderMap>,
        channel: Channel<LlmEvent>,
        cancel: CancellationToken,
    ) -> Result<(), String> {
        let mut headers = extra_headers.unwrap_or_default();
        if !api_key.trim().is_empty() {
            headers.insert(
                AUTHORIZATION,
                HeaderValue::from_str(&format!("Bearer {}", api_key.trim())).map_err(|e| e.to_string())?,
            );
        }
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let mut all_messages = vec![serde_json::json!({ "role": "system", "content": system })];
        for m in messages {
            all_messages.push(serde_json::json!({ "role": m.role, "content": m.content }));
        }

        let openai_tools: Vec<serde_json::Value> = tools
            .iter()
            .map(|t| {
                serde_json::json!({
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.parameters
                    }
                })
            })
            .collect();

        let mut payload = serde_json::json!({
            "model": model,
            "messages": all_messages,
            "stream": true,
            "stream_options": { "include_usage": true }
        });

        if !openai_tools.is_empty() {
            payload["tools"] = serde_json::json!(openai_tools);
        }

        let resp = self
            .client
            .post(endpoint)
            .headers(headers)
            .json(&payload)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            let _ = channel.send(LlmEvent::Error(format!("LLM API {}: {}", status, err_text)));
            return Err(format!("API error {}", status));
        }

        let mut stream = resp.bytes_stream();
        let mut buffer = String::new();
        let mut active_tools: HashMap<u64, (String, String, String)> = HashMap::new();
        let mut in_tok = 0u32;
        let mut out_tok = 0u32;

        loop {
            tokio::select! {
                _ = cancel.cancelled() => {
                    let _ = channel.send(LlmEvent::Done);
                    return Ok(());
                }
                item = stream.next() => {
                    match item {
                        Some(Ok(bytes)) => {
                            if let Ok(chunk) = std::str::from_utf8(&bytes) {
                                buffer.push_str(chunk);
                                while let Some(pos) = buffer.find("\n\n") {
                                    let sse_event = buffer[..pos].to_string();
                                    buffer.drain(..pos + 2);
                                    Self::process_openai_sse(
                                        &sse_event,
                                        &channel,
                                        &mut active_tools,
                                        &mut in_tok,
                                        &mut out_tok,
                                        model,
                                    );
                                }
                            }
                        }
                        Some(Err(e)) => {
                            let _ = channel.send(LlmEvent::Error(e.to_string()));
                            break;
                        }
                        None => {
                            // Flush any remaining active tools
                            for (_, (id, name, args)) in active_tools.drain() {
                                if !name.is_empty() {
                                    let _ = channel.send(LlmEvent::ToolCall {
                                        id,
                                        name,
                                        arguments: args,
                                    });
                                }
                            }
                            let _ = channel.send(LlmEvent::Done);
                            break;
                        }
                    }
                }
            }
        }

        Ok(())
    }

    fn process_anthropic_sse(
        event_block: &str,
        channel: &Channel<LlmEvent>,
        active_tools: &mut HashMap<usize, (String, String, String)>,
        in_tok: &mut u32,
        out_tok: &mut u32,
        model: &str,
    ) {
        for line in event_block.lines() {
            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" {
                    let _ = channel.send(LlmEvent::Done);
                    return;
                }
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(event_type) = val.get("type").and_then(|t| t.as_str()) {
                        match event_type {
                            "message_start" => {
                                if let Some(msg) = val.get("message") {
                                    if let Some(usage) = msg.get("usage") {
                                        *in_tok = usage.get("input_tokens").and_then(|t| t.as_u64()).unwrap_or(0) as u32;
                                    }
                                }
                            }
                            "content_block_start" => {
                                let idx = val.get("index").and_then(|i| i.as_u64()).unwrap_or(0) as usize;
                                if let Some(block) = val.get("content_block") {
                                    let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
                                    if block_type == "tool_use" {
                                        let id = block.get("id").and_then(|s| s.as_str()).unwrap_or("").to_string();
                                        let name = block.get("name").and_then(|s| s.as_str()).unwrap_or("").to_string();
                                        active_tools.insert(idx, (id, name, String::new()));
                                    }
                                }
                            }
                            "content_block_delta" => {
                                let idx = val.get("index").and_then(|i| i.as_u64()).unwrap_or(0) as usize;
                                if let Some(delta) = val.get("delta") {
                                    let delta_type = delta.get("type").and_then(|t| t.as_str()).unwrap_or("");
                                    if delta_type == "text_delta" {
                                        if let Some(text) = delta.get("text").and_then(|t| t.as_str()) {
                                            let _ = channel.send(LlmEvent::TextDelta(text.to_string()));
                                        }
                                    } else if delta_type == "input_json_delta" {
                                        if let Some(partial) = delta.get("partial_json").and_then(|p| p.as_str()) {
                                            if let Some((_, _, args)) = active_tools.get_mut(&idx) {
                                                args.push_str(partial);
                                            }
                                        }
                                    }
                                }
                            }
                            "content_block_stop" => {
                                let idx = val.get("index").and_then(|i| i.as_u64()).unwrap_or(0) as usize;
                                if let Some((id, name, args)) = active_tools.remove(&idx) {
                                    let _ = channel.send(LlmEvent::ToolCall {
                                        id,
                                        name,
                                        arguments: args,
                                    });
                                }
                            }
                            "message_delta" => {
                                if let Some(usage) = val.get("usage") {
                                    *out_tok = usage.get("output_tokens").and_then(|t| t.as_u64()).unwrap_or(0) as u32;
                                    let cost = Self::calculate_cost(model, *in_tok, *out_tok);
                                    let _ = channel.send(LlmEvent::Usage {
                                        input_tokens: *in_tok,
                                        output_tokens: *out_tok,
                                        cost_usd: cost,
                                    });
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
        }
    }

    fn process_openai_sse(
        event_block: &str,
        channel: &Channel<LlmEvent>,
        active_tools: &mut HashMap<u64, (String, String, String)>,
        in_tok: &mut u32,
        out_tok: &mut u32,
        model: &str,
    ) {
        for line in event_block.lines() {
            if let Some(data) = line.strip_prefix("data: ") {
                if data.trim() == "[DONE]" {
                    for (_, (id, name, args)) in active_tools.drain() {
                        if !name.is_empty() {
                            let _ = channel.send(LlmEvent::ToolCall {
                                id,
                                name,
                                arguments: args,
                            });
                        }
                    }
                    let _ = channel.send(LlmEvent::Done);
                    return;
                }

                if let Ok(val) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(usage) = val.get("usage") {
                        if let Some(pt) = usage.get("prompt_tokens").and_then(|t| t.as_u64()) {
                            *in_tok = pt as u32;
                        }
                        if let Some(ct) = usage.get("completion_tokens").and_then(|t| t.as_u64()) {
                            *out_tok = ct as u32;
                        }
                        let cost = Self::calculate_cost(model, *in_tok, *out_tok);
                        let _ = channel.send(LlmEvent::Usage {
                            input_tokens: *in_tok,
                            output_tokens: *out_tok,
                            cost_usd: cost,
                        });
                    }

                    if let Some(choices) = val.get("choices").and_then(|c| c.as_array()) {
                        for choice in choices {
                            if let Some(delta) = choice.get("delta") {
                                if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                                    let _ = channel.send(LlmEvent::TextDelta(content.to_string()));
                                }

                                if let Some(tool_calls) = delta.get("tool_calls").and_then(|tc| tc.as_array()) {
                                    for tc in tool_calls {
                                        let idx = tc.get("index").and_then(|i| i.as_u64()).unwrap_or(0);
                                        let entry = active_tools.entry(idx).or_insert_with(|| (
                                            format!("call_{}", idx),
                                            String::new(),
                                            String::new(),
                                        ));

                                        if let Some(id) = tc.get("id").and_then(|s| s.as_str()) {
                                            entry.0 = id.to_string();
                                        }

                                        if let Some(f) = tc.get("function") {
                                            if let Some(name) = f.get("name").and_then(|s| s.as_str()) {
                                                entry.1.push_str(name);
                                            }
                                            if let Some(args) = f.get("arguments").and_then(|s| s.as_str()) {
                                                entry.2.push_str(args);
                                            }
                                        }
                                    }
                                }
                            }

                            if let Some(finish) = choice.get("finish_reason").and_then(|f| f.as_str()) {
                                if finish == "tool_calls" {
                                    for (_, (id, name, args)) in active_tools.drain() {
                                        if !name.is_empty() {
                                            let _ = channel.send(LlmEvent::ToolCall {
                                                id,
                                                name,
                                                arguments: args,
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
