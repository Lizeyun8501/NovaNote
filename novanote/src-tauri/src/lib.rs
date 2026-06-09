use novanote_core::{NoteMeta, Vault};
use novanote_tauri;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub vault: Mutex<Option<Vault>>,
}

#[derive(Serialize, Deserialize, Clone)]
struct GraphNode {
    id: String,
    title: String,
    path: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct GraphEdge {
    source: String,
    target: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct GraphData {
    nodes: Vec<GraphNode>,
    edges: Vec<GraphEdge>,
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
fn vault_search_regex(state: State<AppState>, pattern: String) -> Result<Vec<NoteMeta>, String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;
    vault.search_regex(&pattern).map_err(|e| e.to_string())
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

#[tauri::command]
fn vault_list_tags(state: State<AppState>) -> Result<Vec<(String, i32)>, String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;
    vault.list_tags().map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_get_notes_by_tag(state: State<AppState>, tag: String) -> Result<Vec<NoteMeta>, String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;
    vault.get_notes_by_tag(&tag).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_get_backlinks(state: State<AppState>, relative_path: String) -> Result<Vec<NoteMeta>, String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;
    vault.get_backlinks(&relative_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_import_obsidian(state: State<AppState>, source_path: String) -> Result<Vec<NoteMeta>, String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;
    vault.import_from_obsidian(Path::new(&source_path)).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_import_notion(state: State<AppState>, source_path: String) -> Result<Vec<NoteMeta>, String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;
    vault.import_from_notion(Path::new(&source_path)).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_import_joplin(state: State<AppState>, source_path: String) -> Result<Vec<NoteMeta>, String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;
    vault.import_from_joplin(Path::new(&source_path)).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_get_graph_data(state: State<AppState>) -> Result<GraphData, String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;

    let notes = vault.list_notes().map_err(|e| e.to_string())?;
    let nodes: Vec<GraphNode> = notes.iter().map(|n| GraphNode {
        id: n.relative_path.clone(),
        title: n.title.clone(),
        path: n.relative_path.clone(),
    }).collect();

    let all_links = vault.get_all_links().map_err(|e| e.to_string())?;
    let edges: Vec<GraphEdge> = all_links.into_iter().map(|(source, target)| GraphEdge { source, target }).collect();

    Ok(GraphData { nodes, edges })
}

#[tauri::command]
fn vault_export_html(state: State<AppState>, relative_path: String, output_path: String) -> Result<(), String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;
    vault.export_note_as_html(&relative_path, &output_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_export_markdown(state: State<AppState>, relative_path: String, output_path: String) -> Result<(), String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;
    let content = std::fs::read_to_string(vault.root_path.join(&relative_path))
        .map_err(|e| e.to_string())?;
    std::fs::write(&output_path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_list_templates(state: State<AppState>) -> Result<Vec<String>, String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;
    vault.list_templates().map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_get_template_content(state: State<AppState>, name: String) -> Result<String, String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;
    vault.get_template_content(&name).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_read_canvas(state: State<AppState>, relative_path: String) -> Result<String, String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;
    let full_path = vault.root_path.join(&relative_path);
    std::fs::read_to_string(&full_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_write_canvas(state: State<AppState>, relative_path: String, data: String) -> Result<(), String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;
    let full_path = vault.root_path.join(&relative_path);
    std::fs::write(&full_path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_save_as_template(state: State<AppState>, name: String, content: String) -> Result<(), String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;
    vault.save_as_template(&name, &content).map_err(|e| e.to_string())
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
            vault_search_regex,
            vault_scan,
            vault_read_note,
            vault_write_note,
            vault_rename_note,
            vault_delete_note,
            vault_list_tags,
            vault_get_notes_by_tag,
            vault_get_backlinks,
            vault_get_graph_data,
            vault_export_html,
            vault_export_markdown,
            vault_list_templates,
            vault_get_template_content,
            vault_save_as_template,
            vault_read_canvas,
            vault_write_canvas
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}