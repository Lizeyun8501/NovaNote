use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::{Duration, Instant};
use tokio::sync::mpsc as tokio_mpsc;

use crate::VaultError;

/// Configuration for the file watcher
#[derive(Debug, Clone)]
pub struct FileWatcherConfig {
    pub vault_path: PathBuf,
    pub debounce_ms: u64,
}

impl FileWatcherConfig {
    pub fn new(vault_path: PathBuf) -> Self {
        Self {
            vault_path,
            debounce_ms: 500,
        }
    }
}

/// File change events emitted by the watcher
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum FileChangeEvent {
    Created { path: PathBuf },
    Modified { path: PathBuf },
    Deleted { path: PathBuf },
    Renamed { from: PathBuf, to: PathBuf },
}

/// File watcher that monitors the vault directory for external changes
pub struct FileWatcher {
    config: FileWatcherConfig,
    watcher: Option<RecommendedWatcher>,
    event_rx: Option<tokio_mpsc::Receiver<FileChangeEvent>>,
    stop_tx: Option<mpsc::Sender<()>>,
}

impl FileWatcher {
    /// Create a new file watcher with the given config
    pub fn new(config: FileWatcherConfig) -> Result<Self, VaultError> {
        Ok(FileWatcher {
            config,
            watcher: None,
            event_rx: None,
            stop_tx: None,
        })
    }

    /// Start watching the vault directory
    pub fn start(&mut self, sender: tokio_mpsc::Sender<FileChangeEvent>) -> Result<(), VaultError> {
        let vault_path = self.config.vault_path.clone();
        let debounce_duration = Duration::from_millis(self.config.debounce_ms);

        // Channel for stop signal
        let (stop_tx, stop_rx) = mpsc::channel::<()>();

        // Channel for raw notify events
        let (raw_tx, raw_rx) = mpsc::channel::<Event>();

        // Create the watcher
        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    let _ = raw_tx.send(event);
                }
            },
            Config::default(),
        )
        .map_err(|e| VaultError::Other(format!("Failed to create file watcher: {}", e)))?;

        // Start watching the vault directory recursively
        watcher
            .watch(&vault_path, RecursiveMode::Recursive)
            .map_err(|e| VaultError::Other(format!("Failed to start watching: {}", e)))?;

        // Spawn a thread for debouncing and event processing
        std::thread::spawn(move || {
            // Track last event time per path for debouncing
            let mut last_event_time: HashMap<PathBuf, Instant> = HashMap::new();
            let mut pending_renames: Option<(PathBuf, PathBuf)> = None;

            loop {
                // Check for stop signal (non-blocking)
                if stop_rx.try_recv().is_ok() {
                    break;
                }

                match raw_rx.recv_timeout(Duration::from_millis(100)) {
                    Ok(event) => {
                        // Skip events for .vault/ directory
                        if event.paths.iter().any(|p| {
                            p.components().any(|c| c.as_os_str() == ".vault")
                        }) {
                            continue;
                        }

                        // Filter: only .md files and attachments directory
                        let relevant_paths: Vec<PathBuf> = event
                            .paths
                            .into_iter()
                            .filter(|p| {
                                // Accept .md files
                                if p.extension().map_or(false, |e| e == "md") {
                                    return true;
                                }
                                // Accept files in the attachments directory
                                if p.components().any(|c| c.as_os_str() == "attachments") {
                                    return true;
                                }
                                // Accept directories (for create/delete of folders)
                                if p.extension().is_none() && !p.components().any(|c| c.as_os_str() == ".vault") {
                                    // Only if it could be a parent of .md files
                                    return false;
                                }
                                false
                            })
                            .collect();

                        if relevant_paths.is_empty() {
                            continue;
                        }

                        // Debounce: skip if we saw an event for this path recently
                        let now = Instant::now();
                        let debounced_paths: Vec<PathBuf> = relevant_paths
                            .into_iter()
                            .filter(|p| {
                                if let Some(last_time) = last_event_time.get(p) {
                                    if now.duration_since(*last_time) < debounce_duration {
                                        return false;
                                    }
                                }
                                last_event_time.insert(p.clone(), now);
                                true
                            })
                            .collect();

                        if debounced_paths.is_empty() {
                            continue;
                        }

                        // Convert notify events to FileChangeEvents
                        match event.kind {
                            EventKind::Create(_) => {
                                for path in debounced_paths {
                                    let _ = sender.blocking_send(FileChangeEvent::Created { path });
                                }
                            }
                            EventKind::Modify(_) => {
                                for path in debounced_paths {
                                    let _ = sender.blocking_send(FileChangeEvent::Modified { path });
                                }
                            }
                            EventKind::Remove(_) => {
                                for path in debounced_paths {
                                    let _ = sender.blocking_send(FileChangeEvent::Deleted { path });
                                }
                            }
                            EventKind::Any => {
                                // Treat as modify
                                for path in debounced_paths {
                                    let _ = sender.blocking_send(FileChangeEvent::Modified { path });
                                }
                            }
                            _ => {}
                        }

                        // Handle pending renames if needed
                        // notify sends rename events as Modify with both paths
                        if let Some((from, to)) = pending_renames.take() {
                            let _ = sender.blocking_send(FileChangeEvent::Renamed { from, to });
                        }
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => {
                        // Normal timeout, continue loop
                    }
                    Err(mpsc::RecvTimeoutError::Disconnected) => {
                        break;
                    }
                }
            }
        });

        // Store the watcher and receiver
        self.watcher = Some(watcher);
        self.stop_tx = Some(stop_tx);

        Ok(())
    }

    /// Stop watching
    pub fn stop(&mut self) -> Result<(), VaultError> {
        if let Some(mut watcher) = self.watcher.take() {
            let _ = watcher.unwatch(&self.config.vault_path);
        }
        if let Some(stop_tx) = self.stop_tx.take() {
            let _ = stop_tx.send(());
        }
        self.event_rx = None;
        Ok(())
    }

    /// Check if the watcher is currently active
    pub fn is_watching(&self) -> bool {
        self.watcher.is_some()
    }
}
