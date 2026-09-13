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

        let payload = serde_json::json!({
            "model": model,
            "max_tokens": 4096,
            "system": system,
            "messages": messages,
            "tools": tools,
            "stream": true
        });

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
                        Err(err) if attempt < 3 => {
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
                                    Self::process_anthropic_sse(&sse_event, &channel);
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

    pub async fn stream_openai(
        &self,
        endpoint: &str,
        api_key: &str,
        model: &str,
        system: &str,
        messages: Vec<ChatMessage>,
        channel: Channel<LlmEvent>,
        cancel: CancellationToken,
    ) -> Result<(), String> {
        let mut headers = HeaderMap::new();
        if !api_key.is_empty() {
            headers.insert(
                AUTHORIZATION,
                HeaderValue::from_str(&format!("Bearer {}", api_key)).map_err(|e| e.to_string())?,
            );
        }
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let mut all_messages = vec![serde_json::json!({ "role": "system", "content": system })];
        for m in messages {
            all_messages.push(serde_json::json!({ "role": m.role, "content": m.content }));
        }

        let payload = serde_json::json!({
            "model": model,
            "messages": all_messages,
            "stream": true
        });

        let target_url = if endpoint.is_empty() {
            "http://localhost:11434/v1/chat/completions"
        } else {
            endpoint
        };

        let resp = self
            .client
            .post(target_url)
            .headers(headers)
            .json(&payload)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let mut stream = resp.bytes_stream();
        let mut buffer = String::new();

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
                                    Self::process_openai_sse(&sse_event, &channel);
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

    fn process_anthropic_sse(event_block: &str, channel: &Channel<LlmEvent>) {
        for line in event_block.lines() {
            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" {
                    let _ = channel.send(LlmEvent::Done);
                    return;
                }
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(event_type) = val.get("type").and_then(|t| t.as_str()) {
                        match event_type {
                            "content_block_delta" => {
                                if let Some(delta) = val.get("delta") {
                                    if let Some(text) = delta.get("text").and_then(|t| t.as_str()) {
                                        let _ = channel.send(LlmEvent::TextDelta(text.to_string()));
                                    }
                                }
                            }
                            "message_delta" => {
                                if let Some(usage) = val.get("usage") {
                                    let output_tokens = usage
                                        .get("output_tokens")
                                        .and_then(|t| t.as_u64())
                                        .unwrap_or(0) as u32;
                                    let _ = channel.send(LlmEvent::Usage {
                                        input_tokens: 0,
                                        output_tokens,
                                        cost_usd: (output_tokens as f64) * 0.000015,
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

    fn process_openai_sse(event_block: &str, channel: &Channel<LlmEvent>) {
        for line in event_block.lines() {
            if let Some(data) = line.strip_prefix("data: ") {
                if data.trim() == "[DONE]" {
                    let _ = channel.send(LlmEvent::Done);
                    return;
                }
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(choices) = val.get("choices").and_then(|c| c.as_array()) {
                        if let Some(first) = choices.first() {
                            if let Some(delta) = first.get("delta") {
                                if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                                    let _ = channel.send(LlmEvent::TextDelta(content.to_string()));
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
