// Thin wrapper library providing core logic helpers used by Tauri commands.
pub use novanote_core;

/// Generate a formatted greeting message using core logic.
pub fn format_greeting(name: &str) -> String {
    format!(
        "Hello, {}! You've been greeted from NovaNote! (core: {})",
        name,
        novanote_core::add(1, 1)
    )
}