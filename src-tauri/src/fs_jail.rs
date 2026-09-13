use std::path::{Component, Path, PathBuf};
use thiserror::Error;

#[derive(Error, Debug, PartialEq, Eq)]
pub enum JailError {
    #[error("Path traversal attempt detected: outside root boundary")]
    OutOfBounds,
    #[error("Access to blocked file pattern denied: {0}")]
    BlockedPattern(String),
    #[error("Path resolution failed or path does not exist")]
    ResolutionFailed,
    #[error("Symlink loop or invalid path")]
    InvalidPath,
}

pub struct FsJail {
    root: PathBuf,
}

impl FsJail {
    pub fn new<P: AsRef<Path>>(root_dir: P) -> Result<Self, JailError> {
        let canonical_root = root_dir
            .as_ref()
            .canonicalize()
            .map_err(|_| JailError::ResolutionFailed)?;

        Ok(Self {
            root: canonical_root,
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn is_blocked(&self, relative_path: &Path) -> bool {
        let path_str = relative_path.to_string_lossy().replace('\\', "/");
        let file_name = relative_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");

        if file_name.starts_with(".env") {
            return true;
        }
        if file_name == "config" && path_str.contains(".git/") {
            return true;
        }
        if file_name.ends_with(".pem") || file_name.starts_with("id_") {
            return true;
        }
        if path_str.starts_with(".ssh/") || path_str.contains("/.ssh/") {
            return true;
        }
        if path_str.starts_with("node_modules/") || path_str.contains("/node_modules/") {
            return true;
        }

        false
    }

    pub fn secure_resolve<P: AsRef<Path>>(&self, untrusted_path: P) -> Result<PathBuf, JailError> {
        let path = untrusted_path.as_ref();

        let mut normalized = PathBuf::new();
        for component in path.components() {
            match component {
                Component::Prefix(p) => normalized.push(Component::Prefix(p)),
                Component::RootDir => normalized.push(Component::RootDir),
                Component::CurDir => {}
                Component::ParentDir => {
                    if !normalized.pop() {
                        return Err(JailError::OutOfBounds);
                    }
                }
                Component::Normal(c) => normalized.push(c),
            }
        }

        let target = if normalized.is_absolute() {
            normalized
        } else {
            self.root.join(normalized)
        };

        let canonical_target = if target.exists() {
            target.canonicalize().map_err(|_| JailError::ResolutionFailed)?
        } else {
            let parent = target.parent().ok_or(JailError::ResolutionFailed)?;
            let canonical_parent = parent.canonicalize().map_err(|_| JailError::ResolutionFailed)?;
            let file_name = target.file_name().ok_or(JailError::ResolutionFailed)?;
            canonical_parent.join(file_name)
        };

        if !canonical_target.starts_with(&self.root) {
            return Err(JailError::OutOfBounds);
        }

        let relative = canonical_target
            .strip_prefix(&self.root)
            .map_err(|_| JailError::OutOfBounds)?;

        if self.is_blocked(relative) {
            return Err(JailError::BlockedPattern(relative.to_string_lossy().to_string()));
        }

        Ok(canonical_target)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{self, File};
    use tempfile::tempdir;

    #[test]
    fn test_jail_containment_and_blocklist() {
        let dir = tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let jail = FsJail::new(&root).unwrap();

        let safe_file = root.join("safe.rs");
        File::create(&safe_file).unwrap();
        assert!(jail.secure_resolve("safe.rs").is_ok());

        assert_eq!(
            jail.secure_resolve("../outside.txt"),
            Err(JailError::OutOfBounds)
        );

        let env_file = root.join(".env.production");
        File::create(&env_file).unwrap();
        assert!(matches!(
            jail.secure_resolve(".env.production"),
            Err(JailError::BlockedPattern(_))
        ));

        let ssh_dir = root.join(".ssh");
        fs::create_dir(&ssh_dir).unwrap();
        let key_file = ssh_dir.join("id_ed25519");
        File::create(&key_file).unwrap();
        assert!(matches!(
            jail.secure_resolve(".ssh/id_ed25519"),
            Err(JailError::BlockedPattern(_))
        ));
    }
}
