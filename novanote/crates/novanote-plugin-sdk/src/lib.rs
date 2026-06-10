// Re-exported event types (mirrored from novanote-plugin-runtime for plugin authors).
use serde::{Deserialize, Serialize};

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

// ---------------------------------------------------------------------------
// Host function declarations (provided by the plugin runtime at link time)
// ---------------------------------------------------------------------------

extern "C" {
    pub fn host_log(msg_ptr: *const u8, msg_len: u32);
    pub fn host_get_note_content(
        path_ptr: *const u8,
        path_len: u32,
        result_ptr: *mut u8,
        result_max_len: u32,
    ) -> i32;
}

// ---------------------------------------------------------------------------
// Plugin trait
// ---------------------------------------------------------------------------

pub trait Plugin {
    fn name() -> &'static str;
    fn version() -> &'static str;
    fn init() -> bool {
        true
    }
    fn on_event(event_json: &str) -> Option<String> {
        let _ = event_json;
        None
    }
}

// ---------------------------------------------------------------------------
// Helper functions for plugin authors
// ---------------------------------------------------------------------------

/// Log a message through the host runtime.
pub fn plugin_log(msg: &str) {
    let bytes = msg.as_bytes();
    unsafe {
        host_log(bytes.as_ptr(), bytes.len() as u32);
    }
}

/// Read the content of a note file through the host runtime.
/// Returns `None` if the file cannot be read.
pub fn read_note(path: &str) -> Option<String> {
    const MAX_LEN: u32 = 65536;
    let mut buf: Vec<u8> = Vec::with_capacity(MAX_LEN as usize);
    // Safety: we only read up to the returned length before using the data.
    unsafe {
        buf.set_len(MAX_LEN as usize);
    }

    let written = unsafe {
        host_get_note_content(
            path.as_ptr(),
            path.len() as u32,
            buf.as_mut_ptr(),
            MAX_LEN,
        )
    };

    if written <= 0 {
        return None;
    }

    unsafe {
        buf.set_len(written as usize);
    }
    Some(String::from_utf8_lossy(&buf).to_string())
}

/// Build a serialized `PluginEvent::Custom` JSON string suitable for
/// passing back to the host or between plugins.
pub fn emit_event(event_type: &str, data: &str) -> String {
    serde_json::json!({
        "Custom": {
            "name": event_type,
            "data": data,
        }
    })
    .to_string()
}

// ---------------------------------------------------------------------------
// Re-export everything from the crate root so the macro works correctly
// ---------------------------------------------------------------------------

#[doc(hidden)]
pub use crate::Plugin as PluginTrait;

// ---------------------------------------------------------------------------
// export_plugin! macro
// ---------------------------------------------------------------------------

#[macro_export]
macro_rules! export_plugin {
    ($plugin_type:ty) => {
        #[no_mangle]
        pub extern "C" fn init() -> i32 {
            if <$plugin_type as $crate::Plugin>::init() {
                0
            } else {
                -1
            }
        }

        #[no_mangle]
        pub extern "C" fn handle_event(
            event_json_ptr: i32,
            event_json_len: i32,
            result_ptr: i32,
            result_len: i32,
        ) -> i32 {
            let event_json = unsafe {
                let slice = ::core::slice::from_raw_parts(
                    event_json_ptr as *const u8,
                    event_json_len as usize,
                );
                ::core::str::from_utf8(slice).unwrap_or("")
            };

            let response = <$plugin_type as $crate::Plugin>::on_event(event_json);

            match response {
                Some(ref resp) => {
                    let data = resp.as_bytes();
                    let len = data.len().min(result_len as usize);
                    unsafe {
                        let buf = ::core::slice::from_raw_parts_mut(
                            result_ptr as *mut u8,
                            result_len as usize,
                        );
                        buf[..len].copy_from_slice(&data[..len]);
                    }
                    len as i32
                }
                None => 0,
            }
        }
    };
}