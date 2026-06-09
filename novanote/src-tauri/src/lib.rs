use novanote_core::{NoteMeta, Vault};
use novanote_tauri;
use std::path::Path;
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub vault: Mutex<Option<Vault>>,
}

#[tauri::command]
fn greet(name: &str) -> String {
    novanote_tauri::format_greeting(name)
}

#[tauri::command]
fn vault_create(state: State<AppState>, path: String) -> Result<String, String> {
    let vault = Vault::create(Path::new(&path)).map_err(|e| e.to_string())?;
    let result = format!("Vault created: {}", vault.config.id);
    *state.vault.lock().map_err(|e| e.to_string())? = Some(vault);
    Ok(result)
}

#[tauri::command]
fn vault_open(state: State<AppState>, path: String) -> Result<String, String> {
    let vault = Vault::open(Path::new(&path)).map_err(|e| e.to_string())?;
    let result = format!("Vault opened: {} ({})", vault.config.name, vault.config.id);
    *state.vault.lock().map_err(|e| e.to_string())? = Some(vault);
    Ok(result)
}

#[tauri::command]
fn vault_list_notes(state: State<AppState>) -> Result<Vec<NoteMeta>, String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;
    vault.list_notes().map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_search(state: State<AppState>, query: String) -> Result<Vec<NoteMeta>, String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;
    vault.search(&query).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_scan(state: State<AppState>) -> Result<Vec<NoteMeta>, String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;
    vault.full_scan().map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_read_note(state: State<AppState>, relative_path: String) -> Result<String, String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;
    let full_path = vault.root_path.join(&relative_path);
    std::fs::read_to_string(&full_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_write_note(state: State<AppState>, relative_path: String, content: String) -> Result<(), String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;
    let full_path = vault.root_path.join(&relative_path);
    std::fs::write(&full_path, &content).map_err(|e| e.to_string())?;
    // Re-index the file
    vault.index_file(&full_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn vault_rename_note(state: State<AppState>, old_relative_path: String, new_relative_path: String) -> Result<(), String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;

    let old_path = vault.root_path.join(&old_relative_path);
    let new_path = vault.root_path.join(&new_relative_path);

    std::fs::rename(&old_path, &new_path).map_err(|e| e.to_string())?;

    // Update index
    vault.remove_file(&old_relative_path).map_err(|e| e.to_string())?;
    vault.index_file(&new_path).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn vault_delete_note(state: State<AppState>, relative_path: String) -> Result<(), String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;

    let full_path = vault.root_path.join(&relative_path);
    std::fs::remove_file(&full_path).map_err(|e| e.to_string())?;
    vault.remove_file(&relative_path).map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            vault: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            vault_create,
            vault_open,
            vault_list_notes,
            vault_search,
            vault_scan,
            vault_read_note,
            vault_write_note,
            vault_rename_note,
            vault_delete_note
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}