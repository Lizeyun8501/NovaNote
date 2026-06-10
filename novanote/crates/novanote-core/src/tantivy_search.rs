//! Tantivy-based advanced full-text search engine
//! Provides dual-engine search alongside FTS5 with support for
//! advanced query syntax (e.g., title:foo AND content:bar)

use serde::{Deserialize, Serialize};
use std::path::Path;
use tantivy::collector::TopDocs;
use tantivy::query::QueryParser;
use tantivy::schema::*;
use tantivy::{doc, Index, IndexWriter, ReloadPolicy};

use crate::VaultError;

/// A search hit from the Tantivy index
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchHit {
    pub path: String,
    pub title: String,
    pub score: f32,
}

/// Tantivy-based full-text search index
pub struct TantivyIndex {
    index: Index,
    writer: IndexWriter,
    schema: Schema,
    path_field: Field,
    title_field: Field,
    content_field: Field,
    tags_field: Field,
}

impl TantivyIndex {
    /// Open an existing Tantivy index or create a new one at the given path
    pub fn open(index_path: &Path) -> Result<Self, VaultError> {
        let schema = Self::build_schema();
        let path_field = schema.get_field("path").unwrap();
        let title_field = schema.get_field("title").unwrap();
        let content_field = schema.get_field("content").unwrap();
        let tags_field = schema.get_field("tags").unwrap();

        std::fs::create_dir_all(index_path)?;

        let index = if index_path.join(".managed.json").exists()
            || index_path.join("meta.json").exists()
        {
            Index::open_in_dir(index_path)?
        } else {
            Index::create_in_dir(index_path, schema.clone())?
        };

        let writer = index.writer(15_000_000)?; // 15 MB heap

        Ok(TantivyIndex {
            index,
            writer,
            schema,
            path_field,
            title_field,
            content_field,
            tags_field,
        })
    }

    fn build_schema() -> Schema {
        let mut schema_builder = Schema::builder();
        schema_builder.add_text_field("path", STRING | STORED);
        schema_builder.add_text_field("title", TEXT | STORED);
        schema_builder.add_text_field("content", TEXT);
        schema_builder.add_text_field("tags", TEXT);
        schema_builder.build()
    }

    /// Add a document to the Tantivy index
    pub fn add_document(
        &mut self,
        path: &str,
        title: &str,
        content: &str,
        tags: &[String],
    ) -> Result<(), VaultError> {
        // Delete any existing document with the same path first
        let term = tantivy::Term::from_field_text(self.path_field, path);
        self.writer.delete_term(term);

        let tags_text = tags.join(" ");
        self.writer.add_document(doc!(
            self.path_field => path,
            self.title_field => title,
            self.content_field => content,
            self.tags_field => tags_text,
        ))?;
        Ok(())
    }

    /// Delete a document from the Tantivy index by path
    pub fn delete_document(&mut self, path: &str) -> Result<(), VaultError> {
        let term = tantivy::Term::from_field_text(self.path_field, path);
        self.writer.delete_term(term);
        Ok(())
    }

    /// Search the Tantivy index with advanced query syntax
    /// Supports queries like: `title:foo AND content:bar`
    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchHit>, VaultError> {
        let reader = self
            .index
            .reader_builder()
            .reload_policy(ReloadPolicy::Manual)
            .try_into()?;

        let searcher = reader.searcher();

        let query_parser = QueryParser::for_index(
            &self.index,
            vec![self.title_field, self.content_field, self.tags_field],
        );
        // Allow default OR for multiple terms, and field-specific queries
        let parsed = query_parser.parse_query(query).map_err(|e| {
            VaultError::Other(format!("Tantivy query parse error: {}", e))
        })?;

        let top_docs = searcher.search(&parsed, &TopDocs::with_limit(limit))?;

        let mut results = Vec::new();
        for (score, doc_address) in top_docs {
            let doc: TantivyDocument = searcher.doc(doc_address)?;
            let path = doc
                .get_first(self.path_field)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let title = doc
                .get_first(self.title_field)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            results.push(SearchHit {
                path,
                title,
                score,
            });
        }

        Ok(results)
    }

    /// Commit pending changes to the index
    pub fn commit(&mut self) -> Result<(), VaultError> {
        self.writer.commit()?;
        Ok(())
    }
}
