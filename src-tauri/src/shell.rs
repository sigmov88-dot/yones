use std::path::Path;
use std::process::Stdio;
use std::time::Duration;
use tokio::process::Command;
use tokio::time::timeout;

const ALLOWED_COMMANDS: &[&str] = &["pnpm", "cargo", "git", "ls", "rg"];

pub struct ShellRunner;

impl ShellRunner {
    pub fn is_allowed(cmd: &str, args: &[String]) -> bool {
        if !ALLOWED_COMMANDS.contains(&cmd) {
            return false;
        }

        if cmd == "git" {
            if let Some(sub) = args.first() {
                return matches!(sub.as_str(), "status" | "diff" | "log" | "branch");
            }
            return false;
        }

        true
    }

    pub async fn execute<P: AsRef<Path>>(
        root: P,
        cmd: &str,
        args: &[String],
    ) -> Result<String, String> {
        if !Self::is_allowed(cmd, args) {
            return Err(format!(
                "Command '{}' with args {:?} is not in the security allow-list.",
                cmd, args
            ));
        }

        let mut child = Command::new(cmd)
            .args(args)
            .current_dir(root)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("Failed to spawn command: {}", e))?;

        let execution = async {
            let output = child
                .wait_with_output()
                .await
                .map_err(|e| format!("Process error: {}", e))?;
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            Ok(format!("{}\n{}", stdout, stderr))
        };

        match timeout(Duration::from_secs(60), execution).await {
            Ok(result) => {
                let mut full_output: String = result?;
                if full_output.len() > 65536 {
                    full_output.truncate(65536);
                    full_output.push_str("\n...[Output truncated to 64KB]");
                }
                Ok(full_output)
            }
            Err(_) => Err("Command execution timed out after 60 seconds.".into()),
        }
    }
}
