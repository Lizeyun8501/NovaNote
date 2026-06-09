use novanote_core::{NoteMeta, Vault};
use novanote_core::{OllamaConfig, AITagResult, AISummaryResult, WritingAssistMode, WritingAssistResult};
use novanote_core::{parse_eml_file, email_to_markdown};
use novanote_core::VectorSearchResult;
use novanote_plugin_runtime::{PluginHost, PluginManifest, PluginInfo, PluginStatus};
use novanote_tauri;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub vault: Mutex<Option<Vault>>,
    pub plugin_host: Mutex<PluginHost>,
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

#[derive(Serialize)]
struct SyncStatusResponse {
    enabled: bool,
    connected: bool,
    server_url: String,
    vault_id: String,
    master_password_set: bool,
    encryption_ready: bool,
    offline_queue_size: usize,
    last_sync: i64,
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

#[tauri::command]
fn sync_configure(state: State<AppState>, server_url: String, vault_id: String) -> Result<(), String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;
    vault.sync_engine.configure(server_url, vault_id);
    Ok(())
}

#[tauri::command]
fn sync_enable(state: State<AppState>) -> Result<(), String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;
    vault.sync_engine.enable();
    Ok(())
}

#[tauri::command]
fn sync_disable(state: State<AppState>) -> Result<(), String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;
    vault.sync_engine.disable();
    Ok(())
}

#[tauri::command]
fn sync_get_status(state: State<AppState>) -> Result<SyncStatusResponse, String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;
    let status = vault.sync_engine.get_status();
    Ok(SyncStatusResponse {
        enabled: status.enabled,
        connected: status.connected,
        server_url: status.server_url,
        vault_id: status.vault_id,
        master_password_set: status.master_password_set,
        encryption_ready: status.encryption_ready,
        offline_queue_size: status.offline_queue_size,
        last_sync: status.last_sync,
    })
}

#[tauri::command]
fn sync_set_master_password(state: State<AppState>, password: String) -> Result<(), String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;
    vault.sync_engine.set_master_password(&password);
    Ok(())
}

#[tauri::command]
async fn ai_check_ollama(base_url: String) -> Result<bool, String> {
    let config = OllamaConfig {
        base_url,
        ..OllamaConfig::default()
    };
    novanote_core::check_ollama(&config).await
}

#[tauri::command]
async fn ai_generate_tags(state: State<'_, AppState>, base_url: String, model: String, relative_path: String) -> Result<AITagResult, String> {
    let content = {
        let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
        let vault = vault_guard.as_ref().ok_or("No vault opened")?;
        let full_path = vault.root_path.join(&relative_path);
        std::fs::read_to_string(&full_path).map_err(|e| e.to_string())?
    };

    let config = OllamaConfig {
        base_url,
        model,
        ..OllamaConfig::default()
    };
    novanote_core::generate_tags(&config, &content).await
}

#[tauri::command]
async fn ai_summarize(state: State<'_, AppState>, base_url: String, model: String, relative_path: String) -> Result<AISummaryResult, String> {
    let content = {
        let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
        let vault = vault_guard.as_ref().ok_or("No vault opened")?;
        let full_path = vault.root_path.join(&relative_path);
        std::fs::read_to_string(&full_path).map_err(|e| e.to_string())?
    };

    let config = OllamaConfig {
        base_url,
        model,
        ..OllamaConfig::default()
    };
    novanote_core::generate_summary(&config, &content).await
}

#[tauri::command]
async fn ai_writing_assist(base_url: String, model: String, text: String, mode: String) -> Result<WritingAssistResult, String> {
    let assist_mode = match mode.as_str() {
        "continue" => WritingAssistMode::Continue,
        "polish" => WritingAssistMode::Polish,
        "translate_to_chinese" => WritingAssistMode::TranslateToChinese,
        "translate_to_english" => WritingAssistMode::TranslateToEnglish,
        _ => return Err(format!("Unknown writing assist mode: {}", mode)),
    };

    let config = OllamaConfig {
        base_url,
        model,
        ..OllamaConfig::default()
    };
    novanote_core::writing_assist(&config, &text, assist_mode).await
}

#[tauri::command]
fn import_email_file(state: State<AppState>, eml_path: String) -> Result<String, String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;

    let email = parse_eml_file(Path::new(&eml_path)).map_err(|e| e.to_string())?;
    let markdown = email_to_markdown(&email);

    // Generate a filename from subject + date
    let sanitized_subject = email.subject
        .chars()
        .take(50)
        .map(|c: char| if c.is_alphanumeric() || c == ' ' || c == '-' { c } else { '_' })
        .collect::<String>()
        .trim()
        .replace("  ", " ")
        .replace(' ', "-");
    let filename = format!("email-{}-{}.md", sanitized_subject, chrono::Utc::now().format("%Y%m%d-%H%M%S"));

    let full_path = vault.root_path.join(&filename);
    std::fs::write(&full_path, &markdown).map_err(|e| e.to_string())?;
    vault.index_file(&full_path).map_err(|e| e.to_string())?;

    Ok(filename)
}

#[tauri::command]
fn import_email_content(state: State<AppState>, content: String) -> Result<String, String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;

    let email = novanote_core::parse_eml_content(content.as_bytes()).map_err(|e: String| e.to_string())?;
    let markdown = email_to_markdown(&email);

    let sanitized_subject = email.subject
        .chars()
        .take(50)
        .map(|c: char| if c.is_alphanumeric() || c == ' ' || c == '-' { c } else { '_' })
        .collect::<String>()
        .trim()
        .replace("  ", " ")
        .replace(' ', "-");
    let filename = format!("email-{}-{}.md", sanitized_subject, chrono::Utc::now().format("%Y%m%d-%H%M%S"));

    let full_path = vault.root_path.join(&filename);
    std::fs::write(&full_path, &markdown).map_err(|e| e.to_string())?;
    vault.index_file(&full_path).map_err(|e| e.to_string())?;

    Ok(filename)
}

#[tauri::command]
async fn ai_semantic_search(
    state: State<'_, AppState>,
    query: String,
    base_url: String,
    model: String,
) -> Result<Vec<VectorSearchResult>, String> {
    // Generate embedding for the query
    let embedding = novanote_core::generate_embedding(&base_url, &model, &query)
        .await
        .map_err(|e| e.to_string())?;

    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;
    vault.semantic_search_with_embedding(&embedding).map_err(|e| e.to_string())
}

#[tauri::command]
async fn ai_index_embedding(
    state: State<'_, AppState>,
    base_url: String,
    model: String,
    relative_path: String,
) -> Result<(), String> {
    let (content, vault_exists) = {
        let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
        let vault = vault_guard.as_ref().ok_or("No vault opened")?;
        let full_path = vault.root_path.join(&relative_path);
        let content = std::fs::read_to_string(&full_path).map_err(|e| e.to_string())?;
        (content, true)
    };
    
    let embedding = novanote_core::generate_embedding(&base_url, &model, &content).await
        .map_err(|e| e.to_string())?;

    if vault_exists {
        let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
        let vault = vault_guard.as_ref().ok_or("No vault opened")?;
        vault.store_embedding(&relative_path, &embedding, &model).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn ai_index_all_embeddings(
    state: State<'_, AppState>,
    base_url: String,
    model: String,
) -> Result<(usize, usize), String> {
    let note_paths: Vec<(String, String)> = {
        let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
        let vault = vault_guard.as_ref().ok_or("No vault opened")?;
        vault.list_notes().map_err(|e| e.to_string())?.into_iter().map(|n| {
            let full_path = vault.root_path.join(&n.relative_path);
            (n.relative_path, full_path.to_string_lossy().to_string())
        }).collect()
    };

    let mut indexed = 0usize;
    let mut errors = 0usize;

    for (relative_path, full_path) in note_paths {
        let content = match std::fs::read_to_string(&full_path) {
            Ok(c) => c,
            Err(_) => { errors += 1; continue; }
        };
        
        // Skip files that are too large
        if content.len() > 10000 {
            continue;
        }

        match novanote_core::generate_embedding(&base_url, &model, &content).await {
            Ok(embedding) => {
                let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
                let vault = vault_guard.as_ref().ok_or("No vault opened")?;
                if vault.store_embedding(&relative_path, &embedding, &model).is_ok() {
                    indexed += 1;
                } else {
                    errors += 1;
                }
            }
            Err(_) => { errors += 1; }
        }
    }

    Ok((indexed, errors))
}

#[tauri::command]
fn ai_embedding_status(state: State<AppState>) -> Result<(bool, i64), String> {
    let vault_guard = state.vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_guard.as_ref().ok_or("No vault opened")?;
    let has = vault.has_embeddings().map_err(|e| e.to_string())?;
    let count = vault.embedding_count().map_err(|e| e.to_string())?;
    Ok((has, count))
}

#[tauri::command]
fn plugin_list(state: State<AppState>) -> Result<Vec<PluginInfo>, String> {
    let host = state.plugin_host.lock().map_err(|e| e.to_string())?;
    Ok(host.list_plugins())
}

#[tauri::command]
fn plugin_install(state: State<AppState>, name: String) -> Result<String, String> {
    let mut host = state.plugin_host.lock().map_err(|e| e.to_string())?;

    // In a real app, this would download the .wasm file from a registry.
    // For now, create a placeholder manifest and attempt to load from plugins dir.
    let plugins_dir = host.plugins_dir().to_path_buf();
    let wasm_path = plugins_dir.join(&name).with_extension("wasm");

    let manifest = PluginManifest {
        name: name.clone(),
        version: "1.0.0".to_string(),
        description: format!("{} plugin", name),
        author: "community".to_string(),
        permissions: vec!["read_notes".to_string()],
        wasm_module_path: wasm_path,
    };

    host.load_plugin(manifest).map_err(|e| e.to_string())
}

#[tauri::command]
fn plugin_uninstall(state: State<AppState>, plugin_id: String) -> Result<(), String> {
    let mut host = state.plugin_host.lock().map_err(|e| e.to_string())?;
    host.unload_plugin(&plugin_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn plugin_enable(state: State<AppState>, plugin_id: String) -> Result<(), String> {
    let mut host = state.plugin_host.lock().map_err(|e| e.to_string())?;
    // Re-enable by reloading the stored manifest
    let info = host.list_plugins().into_iter().find(|p| p.id == plugin_id);
    if let Some(info) = info {
        let manifest = info.manifest.clone();
        host.load_plugin(manifest).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn plugin_disable(state: State<AppState>, plugin_id: String) -> Result<(), String> {
    let mut host = state.plugin_host.lock().map_err(|e| e.to_string())?;
    host.unload_plugin(&plugin_id).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Determine plugins directory
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let plugins_dir = std::path::PathBuf::from(home).join(".novanote").join("plugins");
    std::fs::create_dir_all(&plugins_dir).ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            vault: Mutex::new(None),
            plugin_host: Mutex::new(PluginHost::new(plugins_dir)),
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
            vault_write_canvas,
            sync_configure,
            sync_enable,
            sync_disable,
            sync_get_status,
            sync_set_master_password,
            ai_check_ollama,
            ai_generate_tags,
            ai_summarize,
            ai_writing_assist,
            import_email_file,
            import_email_content,
            ai_semantic_search,
            ai_index_embedding,
            ai_index_all_embeddings,
            ai_embedding_status,
            plugin_list,
            plugin_install,
            plugin_uninstall,
            plugin_enable,
            plugin_disable
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}