//! Git version control integration for NovaNote vaults.
//! Provides automatic git commits on note changes, branch management,
//! and history browsing capabilities.

use crate::VaultError;
use std::path::Path;
use std::process::Command;

/// Git integration for a vault
pub struct GitIntegration {
    vault_path: std::path::PathBuf,
    enabled: bool,
    auto_commit: bool,
    commit_author_name: String,
    commit_author_email: String,
}

impl GitIntegration {
    /// Create a new GitIntegration for the given vault path
    pub fn new(vault_path: &Path) -> Self {
        Self {
            vault_path: vault_path.to_path_buf(),
            enabled: false,
            auto_commit: true,
            commit_author_name: "NovaNote".to_string(),
            commit_author_email: "novanote@local".to_string(),
        }
    }

    /// Check if git is available on the system
    pub fn is_git_available() -> bool {
        Command::new("git")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    /// Check if the vault is a git repository
    pub fn is_initialized(&self) -> bool {
        self.vault_path.join(".git").exists()
    }

    /// Initialize a git repository in the vault
    pub fn init(&self) -> Result<(), VaultError> {
        if self.is_initialized() {
            return Ok(());
        }

        let output = Command::new("git")
            .arg("init")
            .current_dir(&self.vault_path)
            .output()
            .map_err(|e| VaultError::Other(format!("Failed to run git init: {}", e)))?;

        if !output.status.success() {
            return Err(VaultError::Other(format!(
                "git init failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        // Create .gitignore for vault metadata
        let gitignore = "# NovaNote vault metadata\n.vault/\n";
        std::fs::write(self.vault_path.join(".gitignore"), gitignore)?;

        // Initial commit
        self.commit_all("Initial commit: NovaNote vault initialized")?;

        Ok(())
    }

    /// Stage and commit all changes
    pub fn commit_all(&self, message: &str) -> Result<String, VaultError> {
        // Add all files
        let add_output = Command::new("git")
            .args(["add", "-A"])
            .current_dir(&self.vault_path)
            .output()
            .map_err(|e| VaultError::Other(format!("git add failed: {}", e)))?;

        if !add_output.status.success() {
            return Err(VaultError::Other(format!(
                "git add failed: {}",
                String::from_utf8_lossy(&add_output.stderr)
            )));
        }

        // Check if there are changes to commit
        let status_output = Command::new("git")
            .args(["diff", "--cached", "--quiet"])
            .current_dir(&self.vault_path)
            .output()
            .map_err(|e| VaultError::Other(format!("git status failed: {}", e)))?;

        // Exit code 1 means there are changes, 0 means no changes
        if status_output.status.success() {
            return Ok("No changes to commit".to_string());
        }

        // Commit
        let commit_output = Command::new("git")
            .args(["commit", "-m", message])
            .env("GIT_AUTHOR_NAME", &self.commit_author_name)
            .env("GIT_AUTHOR_EMAIL", &self.commit_author_email)
            .env("GIT_COMMITTER_NAME", &self.commit_author_name)
            .env("GIT_COMMITTER_EMAIL", &self.commit_author_email)
            .current_dir(&self.vault_path)
            .output()
            .map_err(|e| VaultError::Other(format!("git commit failed: {}", e)))?;

        if !commit_output.status.success() {
            return Err(VaultError::Other(format!(
                "git commit failed: {}",
                String::from_utf8_lossy(&commit_output.stderr)
            )));
        }

        Ok(String::from_utf8_lossy(&commit_output.stdout).to_string())
    }

    /// Commit a single file
    pub fn commit_file(&self, relative_path: &str, message: &str) -> Result<(), VaultError> {
        let add_output = Command::new("git")
            .args(["add", relative_path])
            .current_dir(&self.vault_path)
            .output()
            .map_err(|e| VaultError::Other(format!("git add failed: {}", e)))?;

        if !add_output.status.success() {
            return Err(VaultError::Other(format!(
                "git add failed for {}: {}",
                relative_path,
                String::from_utf8_lossy(&add_output.stderr)
            )));
        }

        let commit_output = Command::new("git")
            .args(["commit", "-m", message])
            .env("GIT_AUTHOR_NAME", &self.commit_author_name)
            .env("GIT_AUTHOR_EMAIL", &self.commit_author_email)
            .env("GIT_COMMITTER_NAME", &self.commit_author_name)
            .env("GIT_COMMITTER_EMAIL", &self.commit_author_email)
            .current_dir(&self.vault_path)
            .output()
            .map_err(|e| VaultError::Other(format!("git commit failed: {}", e)))?;

        if !commit_output.status.success() {
            // No changes is ok
            let stderr = String::from_utf8_lossy(&commit_output.stderr);
            if stderr.contains("nothing to commit") {
                return Ok(());
            }
            return Err(VaultError::Other(format!("git commit failed: {}", stderr)));
        }

        Ok(())
    }

    /// Get commit log
    pub fn log(&self, max_count: usize) -> Result<Vec<CommitEntry>, VaultError> {
        let output = Command::new("git")
            .args(["log", &format!("--max-count={}", max_count), "--pretty=format:%H|%an|%ae|%aI|%s"])
            .current_dir(&self.vault_path)
            .output()
            .map_err(|e| VaultError::Other(format!("git log failed: {}", e)))?;

        if !output.status.success() {
            return Err(VaultError::Other(format!(
                "git log failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        let mut entries = Vec::new();
        for line in String::from_utf8_lossy(&output.stdout).lines() {
            let parts: Vec<&str> = line.splitn(5, '|').collect();
            if parts.len() == 5 {
                entries.push(CommitEntry {
                    hash: parts[0].to_string(),
                    author_name: parts[1].to_string(),
                    author_email: parts[2].to_string(),
                    date: parts[3].to_string(),
                    message: parts[4].to_string(),
                });
            }
        }

        Ok(entries)
    }

    /// Get diff for a specific file
    pub fn diff(&self, path: &str) -> Result<String, VaultError> {
        let output = Command::new("git")
            .args(["diff", "HEAD", "--", path])
            .current_dir(&self.vault_path)
            .output()
            .map_err(|e| VaultError::Other(format!("git diff failed: {}", e)))?;

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    /// Restore a file to its last committed state
    pub fn restore(&self, path: &str) -> Result<(), VaultError> {
        let output = Command::new("git")
            .args(["checkout", "HEAD", "--", path])
            .current_dir(&self.vault_path)
            .output()
            .map_err(|e| VaultError::Other(format!("git restore failed: {}", e)))?;

        if !output.status.success() {
            return Err(VaultError::Other(format!(
                "git restore failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        Ok(())
    }

    pub fn set_enabled(&mut self, enabled: bool) { self.enabled = enabled; }
    pub fn set_auto_commit(&mut self, auto_commit: bool) { self.auto_commit = auto_commit; }
    pub fn is_enabled(&self) -> bool { self.enabled }
    pub fn is_auto_commit(&self) -> bool { self.auto_commit }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CommitEntry {
    pub hash: String,
    pub author_name: String,
    pub author_email: String,
    pub date: String,
    pub message: String,
}
