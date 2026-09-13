use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LspDiagnostic {
    pub file_path: String,
    pub line: usize,
    pub character: usize,
    pub severity: String, // "error", "warning", "info", "hint"
    pub message: String,
    pub source: Option<String>,
}

pub struct LspClient;

impl LspClient {
    pub fn get_mock_diagnostics(file_path: &str) -> Vec<LspDiagnostic> {
        // Mock LSP diagnostic engine for TS and Rust syntax checks
        if file_path.ends_with(".rs") {
            vec![]
        } else if file_path.ends_with(".ts") || file_path.ends_with(".tsx") {
            vec![]
        } else {
            vec![]
        }
    }
}
