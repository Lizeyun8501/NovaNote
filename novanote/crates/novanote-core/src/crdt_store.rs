//! RocksDB-based CRDT operation store
//! Persists Yrs CRDT updates for fast recovery and sync state tracking.
//! Uses RocksDB for high-throughput write-heavy CRDT operations.

use crate::VaultError;

/// Column family names
const CF_UPDATES: &str = "updates";
const CF_STATE: &str = "state";

/// RocksDB-backed CRDT store
pub struct CrdtStore {
    db: rocksdb::DB,
}

impl CrdtStore {
    /// Open or create a CRDT store at the given path
    pub fn open(path: &std::path::Path) -> Result<Self, VaultError> {
        let mut cf_opts = rocksdb::Options::default();
        cf_opts.set_write_buffer_size(64 * 1024 * 1024); // 64MB write buffer

        let mut db_opts = rocksdb::Options::default();
        db_opts.create_if_missing(true);
        db_opts.create_missing_column_families(true);
        db_opts.set_max_open_files(512);
        db_opts.set_keep_log_file_num(4);

        let cfs = vec![
            rocksdb::ColumnFamilyDescriptor::new(CF_UPDATES, cf_opts.clone()),
            rocksdb::ColumnFamilyDescriptor::new(CF_STATE, cf_opts),
        ];

        let db = rocksdb::DB::open_cf_descriptors(&db_opts, path, cfs)
            .map_err(|e| VaultError::Other(format!("Failed to open RocksDB: {}", e)))?;

        Ok(Self { db })
    }

    /// Store a CRDT update for a document
    pub fn put_update(&self, doc_id: &str, version: u64, data: &[u8]) -> Result<(), VaultError> {
        let cf = self.db.cf_handle(CF_UPDATES)
            .ok_or_else(|| VaultError::Other("CF updates not found".to_string()))?;

        let key = format!("{}:{}", doc_id, version);
        self.db.put_cf(&cf, key.as_bytes(), data)
            .map_err(|e| VaultError::Other(format!("RocksDB write failed: {}", e)))
    }

    /// Get a specific CRDT update
    pub fn get_update(&self, doc_id: &str, version: u64) -> Result<Option<Vec<u8>>, VaultError> {
        let cf = self.db.cf_handle(CF_UPDATES)
            .ok_or_else(|| VaultError::Other("CF updates not found".to_string()))?;

        let key = format!("{}:{}", doc_id, version);
        self.db.get_cf(&cf, key.as_bytes())
            .map_err(|e| VaultError::Other(format!("RocksDB read failed: {}", e)))
    }

    /// Get all updates for a document since a given version
    pub fn get_updates_since(&self, doc_id: &str, since_version: u64) -> Result<Vec<(u64, Vec<u8>)>, VaultError> {
        let cf = self.db.cf_handle(CF_UPDATES)
            .ok_or_else(|| VaultError::Other("CF updates not found".to_string()))?;

        let prefix = format!("{}:", doc_id);
        let mut iter = self.db.raw_iterator_cf(&cf);
        iter.seek(prefix.as_bytes());

        let mut results = Vec::new();
        while let Some((key, value)) = iter.item() {
            let key_str = String::from_utf8_lossy(&key);
            if !key_str.starts_with(&prefix) {
                break;
            }
            // Parse version from key: "doc_id:version"
            if let Some(version_str) = key_str.split(':').last() {
                if let Ok(version) = version_str.parse::<u64>() {
                    if version > since_version {
                        results.push((version, value.to_vec()));
                    }
                }
            }
            iter.next();
        }

        results.sort_by_key(|(v, _)| *v);
        Ok(results)
    }

    /// Store a state value (e.g., sync state vector, last sync timestamp)
    pub fn put_state(&self, key: &str, value: &[u8]) -> Result<(), VaultError> {
        let cf = self.db.cf_handle(CF_STATE)
            .ok_or_else(|| VaultError::Other("CF state not found".to_string()))?;

        self.db.put_cf(&cf, key.as_bytes(), value)
            .map_err(|e| VaultError::Other(format!("RocksDB state write failed: {}", e)))
    }

    /// Get a state value
    pub fn get_state(&self, key: &str) -> Result<Option<Vec<u8>>, VaultError> {
        let cf = self.db.cf_handle(CF_STATE)
            .ok_or_else(|| VaultError::Other("CF state not found".to_string()))?;

        self.db.get_cf(&cf, key.as_bytes())
            .map_err(|e| VaultError::Other(format!("RocksDB state read failed: {}", e)))
    }

    /// Get the latest version number for a document
    pub fn get_latest_version(&self, doc_id: &str) -> Result<u64, VaultError> {
        let cf = self.db.cf_handle(CF_UPDATES)
            .ok_or_else(|| VaultError::Other("CF updates not found".to_string()))?;

        let prefix = format!("{}:", doc_id);
        let mut iter = self.db.raw_iterator_cf(&cf);
        iter.seek_for_prev(format!("{}:~", doc_id).as_bytes()); // ~ is after all digits in ASCII

        if let Some((key, _)) = iter.item() {
            let key_str = String::from_utf8_lossy(&key);
            if key_str.starts_with(&prefix) {
                if let Some(version_str) = key_str.split(':').last() {
                    if let Ok(version) = version_str.parse::<u64>() {
                        return Ok(version);
                    }
                }
            }
        }

        Ok(0)
    }

    /// Compact the CRDT store to reclaim space (merge old updates)
    pub fn compact(&self) -> Result<(), VaultError> {
        if let Some(cf) = self.db.cf_handle(CF_UPDATES) {
            self.db.compact_range_cf(&cf, None::<&[u8]>, None::<&[u8]>);
        }
        if let Some(cf) = self.db.cf_handle(CF_STATE) {
            self.db.compact_range_cf(&cf, None::<&[u8]>, None::<&[u8]>);
        }
        Ok(())
    }
}

impl Drop for CrdtStore {
    fn drop(&mut self) {
        // Ensure proper flush on drop
        let _ = self.db.flush();
    }
}
