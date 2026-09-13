use std::fs;
use std::path::Path;
use ignore::WalkBuilder;
use regex::Regex;
use serde::{Deserialize, Serialize};
use crate::fs_jail::FsJail;

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchMatch {
    pub file_path: String,
    pub line_number: usize,
    pub line_content: String,
}

pub struct SearchEngine;

impl SearchEngine {
    pub fn search<P: AsRef<Path>>(
        root: P,
        query: &str,
        is_regex: bool,
        max_matches: usize,
    ) -> Result<Vec<SearchMatch>, String> {
        let jail = FsJail::new(&root).map_err(|e| e.to_string())?;
        let root_path = jail.root();

        let pattern = if is_regex {
            Regex::new(query).map_err(|e| format!("Invalid regex: {}", e))?
        } else {
            Regex::new(&regex::escape(query)).map_err(|e| format!("Invalid pattern: {}", e))?
        };

        let mut matches = Vec::new();
        let walker = WalkBuilder::new(root_path)
            .hidden(false)
            .git_ignore(true)
            .build();

        for result in walker {
            let entry = match result {
                Ok(e) => e,
                Err(_) => continue,
            };

            let path = entry.path();
            if !entry.file_type().map(|ft| ft.is_file()).unwrap_or(false) {
                continue;
            }

            if let Ok(relative) = path.strip_prefix(root_path) {
                if jail.is_blocked(relative) {
                    continue;
                }

                if let Ok(content) = fs::read_to_string(path) {
                    for (idx, line) in content.lines().enumerate() {
                        if pattern.is_match(line) {
                            matches.push(SearchMatch {
                                file_path: relative.to_string_lossy().replace('\\', "/"),
                                line_number: idx + 1,
                                line_content: line.trim().to_string(),
                            });

                            if matches.len() >= max_matches {
                                return Ok(matches);
                            }
                        }
                    }
                }
            }
        }

        Ok(matches)
    }
}
