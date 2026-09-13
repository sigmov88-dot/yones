use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ApplyError {
    #[error("File not found: {0}")]
    FileNotFound(String),
    #[error("Search block match failed in file: {0}")]
    MatchFailed(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Transaction aborted: file modified externally")]
    ConflictDetected(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchReplaceBlock {
    pub search: String,
    pub replace: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilePatch {
    pub relative_path: String,
    pub blocks: Vec<SearchReplaceBlock>,
    pub base_checksum: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplyTransaction {
    pub id: String,
    pub patches: Vec<FilePatch>,
}

pub struct Checkpoint {
    pub id: String,
    pub backups: HashMap<PathBuf, String>,
}

pub struct TransactionManager {
    root_dir: PathBuf,
    history: Vec<Checkpoint>,
}

impl TransactionManager {
    pub fn new<P: AsRef<Path>>(root: P) -> Self {
        Self {
            root_dir: root.as_ref().to_path_buf(),
            history: Vec::new(),
        }
    }

    fn apply_blocks_to_content(content: &str, blocks: &[SearchReplaceBlock]) -> Result<String, String> {
        let mut result = content.to_string();
        for block in blocks {
            let normalized_search = block.search.replace("\r\n", "\n");
            let normalized_target = result.replace("\r\n", "\n");

            if let Some(pos) = normalized_target.find(&normalized_search) {
                let mut new_result = String::with_capacity(result.len() + block.replace.len());
                new_result.push_str(&normalized_target[..pos]);
                new_result.push_str(&block.replace.replace("\r\n", "\n"));
                new_result.push_str(&normalized_target[pos + normalized_search.len()..]);
                result = new_result;
            } else {
                return Err(format!("Could not locate anchor block:\n{}", block.search));
            }
        }
        Ok(result)
    }

    pub fn execute_transaction(&mut self, tx: ApplyTransaction) -> Result<(), ApplyError> {
        let mut backups: HashMap<PathBuf, String> = HashMap::new();
        let mut staged_writes: Vec<(PathBuf, String)> = Vec::new();

        for patch in &tx.patches {
            let target_path = self.root_dir.join(&patch.relative_path);
            if !target_path.exists() {
                return Err(ApplyError::FileNotFound(patch.relative_path.clone()));
            }

            let original_content = fs::read_to_string(&target_path)?;
            backups.insert(target_path.clone(), original_content.clone());

            match Self::apply_blocks_to_content(&original_content, &patch.blocks) {
                Ok(new_content) => {
                    staged_writes.push((target_path, new_content));
                }
                Err(_) => {
                    return Err(ApplyError::MatchFailed(patch.relative_path.clone()));
                }
            }
        }

        let mut applied_paths: Vec<PathBuf> = Vec::new();
        for (path, content) in staged_writes {
            if let Err(e) = fs::write(&path, content) {
                self.rollback_paths(&applied_paths, &backups);
                return Err(ApplyError::Io(e));
            }
            applied_paths.push(path);
        }

        self.history.push(Checkpoint {
            id: tx.id,
            backups,
        });

        Ok(())
    }

    fn rollback_paths(&self, applied: &[PathBuf], backups: &HashMap<PathBuf, String>) {
        for path in applied {
            if let Some(original) = backups.get(path) {
                let _ = fs::write(path, original);
            }
        }
    }

    pub fn rollback_checkpoint(&mut self, checkpoint_id: &str) -> Result<(), ApplyError> {
        if let Some(index) = self.history.iter().position(|c| c.id == checkpoint_id) {
            let checkpoint = self.history.remove(index);
            for (path, content) in checkpoint.backups {
                fs::write(path, content)?;
            }
            Ok(())
        } else {
            Err(ApplyError::FileNotFound(format!("Checkpoint {}", checkpoint_id)))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_atomic_transaction_success_and_rollback() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let file1 = root.join("a.txt");
        let file2 = root.join("b.txt");

        fs::write(&file1, "line 1\nline 2\nline 3\n").unwrap();
        fs::write(&file2, "const x = 10;\n").unwrap();

        let mut mgr = TransactionManager::new(root);

        let tx = ApplyTransaction {
            id: "tx-1".to_string(),
            patches: vec![
                FilePatch {
                    relative_path: "a.txt".to_string(),
                    blocks: vec![SearchReplaceBlock {
                        search: "line 2\n".to_string(),
                        replace: "line 2 modified\n".to_string(),
                    }],
                    base_checksum: None,
                },
                FilePatch {
                    relative_path: "b.txt".to_string(),
                    blocks: vec![SearchReplaceBlock {
                        search: "const x = 10;".to_string(),
                        replace: "const x = 20;".to_string(),
                    }],
                    base_checksum: None,
                },
            ],
        };

        assert!(mgr.execute_transaction(tx).is_ok());
        assert_eq!(fs::read_to_string(&file1).unwrap(), "line 1\nline 2 modified\nline 3\n");
        assert_eq!(fs::read_to_string(&file2).unwrap(), "const x = 20;\n");

        assert!(mgr.rollback_checkpoint("tx-1").is_ok());
        assert_eq!(fs::read_to_string(&file1).unwrap(), "line 1\nline 2\nline 3\n");
        assert_eq!(fs::read_to_string(&file2).unwrap(), "const x = 10;\n");
    }

    #[test]
    fn test_transaction_all_or_nothing_on_failure() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let file1 = root.join("a.txt");
        let file2 = root.join("b.txt");

        fs::write(&file1, "alpha\n").unwrap();
        fs::write(&file2, "beta\n").unwrap();

        let mut mgr = TransactionManager::new(root);

        let tx = ApplyTransaction {
            id: "tx-fail".to_string(),
            patches: vec![
                FilePatch {
                    relative_path: "a.txt".to_string(),
                    blocks: vec![SearchReplaceBlock {
                        search: "alpha\n".to_string(),
                        replace: "gamma\n".to_string(),
                    }],
                    base_checksum: None,
                },
                FilePatch {
                    relative_path: "b.txt".to_string(),
                    blocks: vec![SearchReplaceBlock {
                        search: "non-existent anchor\n".to_string(),
                        replace: "delta\n".to_string(),
                    }],
                    base_checksum: None,
                },
            ],
        };

        assert!(mgr.execute_transaction(tx).is_err());
        assert_eq!(fs::read_to_string(&file1).unwrap(), "alpha\n");
        assert_eq!(fs::read_to_string(&file2).unwrap(), "beta\n");
    }
}
