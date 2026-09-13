use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SymbolInfo {
    pub name: String,
    pub kind: String, // "function", "class", "interface", "struct", "enum"
    pub line_start: usize,
    pub line_end: usize,
}

pub struct AstIndexer;

impl AstIndexer {
    /// Fast symbol extraction based on language patterns (TypeScript, Rust)
    pub fn extract_symbols(content: &str, file_path: &Path) -> Vec<SymbolInfo> {
        let mut symbols = Vec::new();
        let ext = file_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");

        for (idx, line) in content.lines().enumerate() {
            let trimmed = line.trim();

            match ext {
                "rs" => {
                    if trimmed.starts_with("pub fn ") || trimmed.starts_with("fn ") {
                        if let Some(name) = trimmed.split('(').next() {
                            let clean_name = name.split_whitespace().last().unwrap_or("");
                            symbols.push(SymbolInfo {
                                name: clean_name.to_string(),
                                kind: "function".to_string(),
                                line_start: idx + 1,
                                line_end: idx + 1,
                            });
                        }
                    } else if trimmed.starts_with("pub struct ") || trimmed.starts_with("struct ") {
                        let parts: Vec<&str> = trimmed.split_whitespace().collect();
                        if let Some(name) = parts.get(if trimmed.starts_with("pub") { 2 } else { 1 }) {
                            symbols.push(SymbolInfo {
                                name: name.replace('{', "").trim().to_string(),
                                kind: "struct".to_string(),
                                line_start: idx + 1,
                                line_end: idx + 1,
                            });
                        }
                    }
                }
                "ts" | "tsx" | "js" | "jsx" => {
                    if trimmed.starts_with("export function ") || trimmed.starts_with("function ") {
                        if let Some(name) = trimmed.split('(').next() {
                            let clean_name = name.split_whitespace().last().unwrap_or("");
                            symbols.push(SymbolInfo {
                                name: clean_name.to_string(),
                                kind: "function".to_string(),
                                line_start: idx + 1,
                                line_end: idx + 1,
                            });
                        }
                    } else if trimmed.starts_with("export interface ") || trimmed.starts_with("interface ") {
                        let parts: Vec<&str> = trimmed.split_whitespace().collect();
                        if let Some(name) = parts.get(if trimmed.starts_with("export") { 2 } else { 1 }) {
                            symbols.push(SymbolInfo {
                                name: name.replace('{', "").trim().to_string(),
                                kind: "interface".to_string(),
                                line_start: idx + 1,
                                line_end: idx + 1,
                            });
                        }
                    }
                }
                _ => {}
            }
        }

        symbols
    }
}
