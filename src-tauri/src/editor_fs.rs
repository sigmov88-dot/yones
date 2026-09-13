use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};
use ignore::WalkBuilder;
use crate::fs_jail::FsJail;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNodeInfo {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub depth: usize,
}

pub struct EditorFs;

impl EditorFs {
    pub fn list_tree<P: AsRef<Path>>(root: P) -> Result<Vec<FileNodeInfo>, String> {
        let jail = FsJail::new(&root).map_err(|e| e.to_string())?;
        let root_path = jail.root();

        let mut entries = Vec::new();
        let walker = WalkBuilder::new(root_path)
            .hidden(false)
            .git_ignore(true)
            .max_depth(Some(8))
            .build();

        for result in walker {
            match result {
                Ok(entry) => {
                    let path = entry.path();
                    if path == root_path {
                        continue;
                    }

                    if let Ok(relative) = path.strip_prefix(root_path) {
                        if jail.is_blocked(relative) {
                            continue;
                        }

                        let depth = relative.components().count();
                        let name = entry.file_name().to_string_lossy().to_string();
                        let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);

                        entries.push(FileNodeInfo {
                            path: relative.to_string_lossy().replace('\\', "/"),
                            name,
                            is_dir,
                            depth,
                        });
                    }
                }
                Err(err) => {
                    eprintln!("Walk error: {}", err);
                }
            }
        }

        Ok(entries)
    }

    pub fn read_file<P: AsRef<Path>>(root: P, relative_path: &str) -> Result<String, String> {
        let jail = FsJail::new(root).map_err(|e| e.to_string())?;
        let safe_path = jail.secure_resolve(relative_path).map_err(|e| e.to_string())?;
        fs::read_to_string(&safe_path).map_err(|e| e.to_string())
    }

    pub fn write_file<P: AsRef<Path>>(root: P, relative_path: &str, content: &str) -> Result<(), String> {
        let jail = FsJail::new(root).map_err(|e| e.to_string())?;
        let safe_path = jail.secure_resolve(relative_path).map_err(|e| e.to_string())?;
        fs::write(&safe_path, content).map_err(|e| e.to_string())
    }
}
