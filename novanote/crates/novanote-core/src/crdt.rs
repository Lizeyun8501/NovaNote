use std::collections::HashMap;
use std::sync::Mutex;
use yrs::updates::decoder::Decode;
use yrs::updates::encoder::Encode;
use yrs::{Doc, GetString, ReadTxn, StateVector, Text, Transact, Update};

pub struct YDocHolder {
    docs: Mutex<HashMap<String, Doc>>,
}

impl YDocHolder {
    pub fn new() -> Self {
        YDocHolder {
            docs: Mutex::new(HashMap::new()),
        }
    }

    /// Get or create a YrsDoc for a note
    pub fn get_or_create(&self, note_id: &str) -> Doc {
        let mut docs = self.docs.lock().unwrap();
        if !docs.contains_key(note_id) {
            docs.insert(note_id.to_string(), Doc::new());
        }
        docs.get(note_id).unwrap().clone()
    }

    /// Initialize a YrsDoc from Markdown content
    pub fn init_from_markdown(&self, note_id: &str, markdown: &str) -> Doc {
        let doc = Doc::new();
        let text = doc.get_or_insert_text("content");

        {
            let mut txn = doc.transact_mut();
            text.push(&mut txn, markdown);
        }

        let mut docs = self.docs.lock().unwrap();
        docs.insert(note_id.to_string(), doc.clone());
        doc
    }

    /// Export Markdown from YrsDoc
    pub fn to_markdown(&self, note_id: &str) -> Option<String> {
        let docs = self.docs.lock().unwrap();
        let doc = docs.get(note_id)?;
        let text = doc.get_or_insert_text("content");
        let txn = doc.transact();
        Some(text.get_string(&txn))
    }

    /// Get incremental update since given state vector
    pub fn get_update(&self, note_id: &str, state_vector: &[u8]) -> Option<Vec<u8>> {
        let docs = self.docs.lock().unwrap();
        let doc = docs.get(note_id)?;
        let txn = doc.transact();
        let sv = StateVector::decode_v1(state_vector).ok()?;
        let update = txn.encode_diff_v1(&sv);
        Some(update)
    }

    /// Get full state vector of the document
    pub fn get_state_vector(&self, note_id: &str) -> Option<Vec<u8>> {
        let docs = self.docs.lock().unwrap();
        let doc = docs.get(note_id)?;
        let txn = doc.transact();
        let sv = txn.state_vector();
        Some(sv.encode_v1())
    }

    /// Apply a remote update to the document
    pub fn apply_update(&self, note_id: &str, update_data: &[u8]) -> Result<(), String> {
        let docs = self.docs.lock().unwrap();
        let doc = docs.get(note_id).ok_or("Doc not found")?;
        let mut txn = doc.transact_mut();
        let update = Update::decode_v1(update_data)
            .map_err(|e| format!("Failed to decode update: {}", e))?;
        txn.apply_update(update);

        Ok(())
    }

    /// Get the full encoded document (for full sync)
    pub fn get_encoded(&self, note_id: &str) -> Option<Vec<u8>> {
        let docs = self.docs.lock().unwrap();
        let doc = docs.get(note_id)?;
        let txn = doc.transact();
        let sv = StateVector::default();
        Some(txn.encode_state_as_update_v1(&sv))
    }

    /// Load from encoded state
    pub fn load_encoded(&self, note_id: &str, encoded: &[u8]) {
        let doc = Doc::new();
        {
            let mut txn = doc.transact_mut();
            let update = Update::decode_v1(encoded).unwrap();
            txn.apply_update(update);
        }
        let mut docs = self.docs.lock().unwrap();
        docs.insert(note_id.to_string(), doc);
    }

    /// Remove a note's doc
    pub fn remove(&self, note_id: &str) {
        let mut docs = self.docs.lock().unwrap();
        docs.remove(note_id);
    }
}

impl Clone for YDocHolder {
    fn clone(&self) -> Self {
        let docs = self.docs.lock().unwrap();
        let cloned: HashMap<String, Doc> = docs.iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();
        YDocHolder {
            docs: Mutex::new(cloned),
        }
    }
}

impl Default for YDocHolder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_markdown_to_ydoc_and_back() {
        let holder = YDocHolder::new();
        let md = "# Hello\n\nThis is **bold**\n\n- item 1\n- item 2\n";
        holder.init_from_markdown("test1", md);
        let result = holder.to_markdown("test1").unwrap();
        assert_eq!(result, md);
    }

    #[test]
    fn test_update_propagation() {
        let holder = YDocHolder::new();

        // Device A creates doc with initial content
        let doc_a = holder.init_from_markdown("shared", "# Original\n");
        let sv_a = holder.get_state_vector("shared").unwrap();
        let encoded_a = holder.get_encoded("shared").unwrap();

        // Device B loads from encoded (as a separate note with different id)
        holder.load_encoded("shared_b", &encoded_a);

        // Device A makes changes by appending text
        // Doc is Clone (ref-counted), so modifications to clone affect shared state
        {
            let doc_clone = doc_a.clone();
            let text = doc_clone.get_or_insert_text("content");
            let mut txn = doc_clone.transact_mut();
            text.push(&mut txn, "Added by A\n");
        }

        // Get incremental update from A (changes since sv_a)
        let update = holder.get_update("shared", &sv_a).unwrap();
        assert!(!update.is_empty());

        // Apply update to B
        holder.apply_update("shared_b", &update).ok();

        // Both devices should have the same final content
        let content_a = holder.to_markdown("shared").unwrap();
        let content_b = holder.to_markdown("shared_b").unwrap();
        assert_eq!(content_a, content_b);
    }
}