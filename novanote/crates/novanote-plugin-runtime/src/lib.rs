use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use uuid::Uuid;
use wasmtime::{
    AsContext, AsContextMut, Config, Engine, Instance, Linker, Memory, Module, Store, TypedFunc,
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub permissions: Vec<String>,
    pub wasm_module_path: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PluginEvent {
    NoteSaved {
        path: String,
        content: String,
    },
    NoteOpened {
        path: String,
    },
    NoteDeleted {
        path: String,
    },
    AppStarted,
    ThemeChanged {
        theme: String,
    },
    Custom {
        name: String,
        data: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub status: PluginStatus,
    pub manifest: PluginManifest,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PluginStatus {
    Loaded,
    Unloaded,
}

#[derive(Debug, thiserror::Error)]
pub enum PluginError {
    #[error("Plugin not found: {0}")]
    PluginNotFound(String),

    #[error("Plugin already loaded: {0}")]
    PluginAlreadyLoaded(String),

    #[error("Failed to read WASM module from {path}: {source}")]
    WasmReadError {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("Wasm error: {0}")]
    WasmError(#[from] wasmtime::Error),

    #[error("Plugin init failed with code: {0}")]
    InitFailed(i32),

    #[error("Plugin event error: {0}")]
    EventError(String),

    #[error("Plugin missing required export: {0}")]
    MissingExport(String),

    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

struct PluginState {
    plugin_id: String,
    memory: Option<Memory>,
    notes_dir: PathBuf,
}

const INPUT_OFFSET: u32 = 0;
const RESULT_OFFSET: u32 = 8192;
const RESULT_MAX_LEN: u32 = 8192;

struct LoadedPlugin {
    store: Store<PluginState>,
    instance: Instance,
    #[allow(dead_code)]
    module: Module,
    manifest: PluginManifest,
}

// Helper to get a clone of the Memory from the store.
fn get_memory(store: &Store<PluginState>) -> Memory {
    store
        .data()
        .memory
        .clone()
        .expect("memory not initialized in plugin store")
}

// Helper to get a clone of the Memory from a Caller (for use inside host functions).
fn caller_memory(caller: &wasmtime::Caller<'_, PluginState>) -> Memory {
    caller
        .data()
        .memory
        .clone()
        .expect("memory not initialized in plugin store")
}

// ---------------------------------------------------------------------------
// PluginHost
// ---------------------------------------------------------------------------

pub struct PluginHost {
    plugins_dir: PathBuf,
    engine: Engine,
    plugins: HashMap<String, LoadedPlugin>,
}

impl PluginHost {
    pub fn new(plugins_dir: PathBuf) -> Self {
        let mut config = Config::new();
        config.cache_config_load_default().ok();

        let engine = Engine::new(&config).expect("failed to create wasmtime engine");

        Self {
            plugins_dir,
            engine,
            plugins: HashMap::new(),
        }
    }

    /// Get the plugins directory path
    pub fn plugins_dir(&self) -> &Path {
        &self.plugins_dir
    }

    /// Load a plugin from its manifest, returning the assigned plugin id.
    pub fn load_plugin(&mut self, manifest: PluginManifest) -> Result<String, PluginError> {
        for p in self.plugins.values() {
            if p.manifest.name == manifest.name && p.manifest.version == manifest.version {
                return Err(PluginError::PluginAlreadyLoaded(manifest.name.clone()));
            }
        }

        let wasm_bytes = std::fs::read(&manifest.wasm_module_path).map_err(|e| {
            PluginError::WasmReadError {
                path: manifest.wasm_module_path.clone(),
                source: e,
            }
        })?;

        let module = Module::from_binary(&self.engine, &wasm_bytes)?;

        let plugin_id = Uuid::new_v4().to_string();

        // Build initial store (memory is None until we get the export).
        let plugin_state = PluginState {
            plugin_id: plugin_id.clone(),
            memory: None,
            notes_dir: self.plugins_dir.clone(),
        };

        let mut store = Store::new(&self.engine, plugin_state);

        // Linker + host functions
        let mut linker = Linker::new(&self.engine);

        // host_log(ptr, len) — prints a message from the guest
        linker.func_wrap(
            "env",
            "host_log",
            |caller: wasmtime::Caller<'_, PluginState>,
             msg_ptr: i32,
             msg_len: i32|
             -> Result<(), wasmtime::Error> {
                let len = msg_len.max(0) as usize;
                if len == 0 {
                    return Ok(());
                }
                let mem = caller_memory(&caller);
                let mut buf = vec![0u8; len];
                mem.read(caller.as_context(), msg_ptr as usize, &mut buf)
                    .map_err(|e| wasmtime::Error::new(e))?;
                let msg = String::from_utf8_lossy(&buf);
                let plugin_id = &caller.data().plugin_id;
                println!("[plugin:{}] {}", plugin_id, msg);
                Ok(())
            },
        )?;

        // host_get_note_content(path_ptr, path_len, result_ptr, result_max) -> i32
        linker.func_wrap(
            "env",
            "host_get_note_content",
            |mut caller: wasmtime::Caller<'_, PluginState>,
             path_ptr: i32,
             path_len: i32,
             result_ptr: i32,
             result_max: i32|
             -> Result<i32, wasmtime::Error> {
                let path_len = path_len.max(0) as usize;
                let result_max = result_max.max(0) as usize;

                let mem = caller_memory(&caller);
                let mut path_buf = vec![0u8; path_len];
                mem.read(caller.as_context(), path_ptr as usize, &mut path_buf)
                    .map_err(|e| wasmtime::Error::new(e))?;

                let path_str = String::from_utf8_lossy(&path_buf).to_string();
                let notes_dir = &caller.data().notes_dir;
                let full_path = notes_dir.join(&path_str);

                let content = match std::fs::read_to_string(&full_path) {
                    Ok(c) => c,
                    Err(_) => return Ok(-1),
                };

                let data = content.as_bytes();
                let write_len = data.len().min(result_max);

                mem.write(
                    caller.as_context_mut(),
                    result_ptr as usize,
                    &data[..write_len],
                )
                .map_err(|e| wasmtime::Error::new(e))?;

                Ok(write_len as i32)
            },
        )?;

        // Instantiate the module
        let instance = linker.instantiate(&mut store, &module)?;

        // Grab the exported memory and stash it in the store data.
        let mem = instance
            .get_memory(&mut store, "memory")
            .ok_or_else(|| PluginError::MissingExport("memory".to_string()))?;
        store.data_mut().memory = Some(mem);

        // Call init()
        let init_fn: TypedFunc<(), i32> = instance
            .get_typed_func(&mut store, "init")
            .map_err(|_| PluginError::MissingExport("init".to_string()))?;
        let init_result = init_fn.call(&mut store, ())?;
        if init_result != 0 {
            return Err(PluginError::InitFailed(init_result));
        }

        self.plugins.insert(
            plugin_id.clone(),
            LoadedPlugin {
                store,
                instance,
                module,
                manifest: manifest.clone(),
            },
        );

        Ok(plugin_id)
    }

    /// Unload a previously loaded plugin.
    pub fn unload_plugin(&mut self, plugin_id: &str) -> Result<(), PluginError> {
        if self.plugins.remove(plugin_id).is_none() {
            return Err(PluginError::PluginNotFound(plugin_id.to_string()));
        }
        Ok(())
    }

    /// List all loaded plugins.
    pub fn list_plugins(&self) -> Vec<PluginInfo> {
        self.plugins
            .iter()
            .map(|(id, p)| PluginInfo {
                id: id.clone(),
                name: p.manifest.name.clone(),
                version: p.manifest.version.clone(),
                status: PluginStatus::Loaded,
                manifest: p.manifest.clone(),
            })
            .collect()
    }

    /// Call a plugin's handle_event export, returning the JSON response.
    pub fn call_plugin(
        &mut self,
        plugin_id: &str,
        event: &PluginEvent,
    ) -> Result<String, PluginError> {
        let plugin = self
            .plugins
            .get_mut(plugin_id)
            .ok_or_else(|| PluginError::PluginNotFound(plugin_id.to_string()))?;

        let event_json = serde_json::to_string(event)?;
        let event_bytes = event_json.as_bytes();

        let mem = get_memory(&plugin.store);

        // Ensure guest memory has enough pages
        let needed_bytes = (RESULT_OFFSET + RESULT_MAX_LEN) as u64;
        let current_pages = mem.size(&plugin.store);
        let current_bytes = current_pages * 65536;
        if current_bytes < needed_bytes {
            let needed_pages = (needed_bytes + 65535) / 65536;
            mem.grow(&mut plugin.store, needed_pages - current_pages)
                .map_err(|e| PluginError::EventError(format!("memory grow failed: {}", e)))?;
        }

        // Write input
        mem.write(&mut plugin.store, INPUT_OFFSET as usize, event_bytes)
            .map_err(|e| PluginError::EventError(e.to_string()))?;

        // Call handle_event
        let handle_event: TypedFunc<(i32, i32, i32, i32), i32> = plugin
            .instance
            .get_typed_func(&mut plugin.store, "handle_event")
            .map_err(|_| PluginError::MissingExport("handle_event".to_string()))?;

        let result = handle_event.call(
            &mut plugin.store,
            (
                INPUT_OFFSET as i32,
                event_bytes.len() as i32,
                RESULT_OFFSET as i32,
                RESULT_MAX_LEN as i32,
            ),
        )?;

        if result < 0 {
            return Err(PluginError::EventError(format!(
                "handle_event returned {}",
                result
            )));
        }

        let result_len = (result as usize).min(RESULT_MAX_LEN as usize);
        let mut buf = vec![0u8; result_len];
        mem.read(&plugin.store, RESULT_OFFSET as usize, &mut buf)
            .map_err(|e| PluginError::EventError(e.to_string()))?;
        let response = String::from_utf8_lossy(&buf[..result_len]).to_string();

        Ok(response)
    }
}