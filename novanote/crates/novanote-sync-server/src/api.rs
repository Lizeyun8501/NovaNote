//! REST API handlers for the NovaNote sync server
//! Provides JSON endpoints for health, document management, push/pull, and stats.

use axum::{
    Json,
    extract::{Path, State, Query},
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use base64::Engine;
use uuid::Uuid;
use crate::server::AppState;
use crate::storage;

// ── Response types ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ApiHealthResponse {
    pub status: String,
    pub version: String,
    pub uptime_seconds: u64,
}

#[derive(Debug, Serialize)]
pub struct DocListItem {
    pub doc_id: String,
    pub version_count: i64,
    pub latest_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DocDetail {
    pub doc_id: String,
    pub versions: Vec<DocVersion>,
}

#[derive(Debug, Serialize)]
pub struct DocVersion {
    pub id: String,
    pub vector_clock: serde_json::Value,
    pub created_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PushRequest {
    pub encrypted_blob: String,       // base64-encoded
    pub vector_clock: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct PushResponse {
    pub ok: bool,
    pub version_id: String,
}

#[derive(Debug, Deserialize)]
pub struct PullQuery {
    pub since_version: Option<String>,  // version UUID to pull updates after
}

#[derive(Debug, Serialize)]
pub struct PullResponse {
    pub updates: Vec<PullUpdate>,
}

#[derive(Debug, Serialize)]
pub struct PullUpdate {
    pub id: String,
    pub encrypted_blob: String,  // base64-encoded
    pub vector_clock: serde_json::Value,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct StatsResponse {
    pub total_documents: i64,
    pub total_versions: i64,
    pub total_users: i64,
}

// ── Handlers ────────────────────────────────────────────────────────────────

pub async fn api_health(State(_state): State<AppState>) -> Json<ApiHealthResponse> {
    Json(ApiHealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime_seconds: 0, // simplified; could track start time in AppState
    })
}

pub async fn api_list_docs(State(state): State<AppState>) -> Json<Vec<DocListItem>> {
    let rows = sqlx::query(
        r#"
        SELECT doc_id, COUNT(*) as version_count, MAX(created_at) as latest_at
        FROM doc_blobs
        GROUP BY doc_id
        ORDER BY latest_at DESC
        "#
    )
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let mut items = Vec::new();
    for row in rows {
        let doc_id: Uuid = row.get("doc_id");
        let version_count: i64 = row.get("version_count");
        let latest_at: Option<chrono::DateTime<chrono::Utc>> = row.get("latest_at");
        items.push(DocListItem {
            doc_id: doc_id.to_string(),
            version_count,
            latest_at: latest_at.map(|dt: chrono::DateTime<chrono::Utc>| dt.to_rfc3339()),
        });
    }
    Json(items)
}

pub async fn api_get_doc(
    State(state): State<AppState>,
    Path(doc_id): Path<String>,
) -> Result<Json<DocDetail>, axum::http::StatusCode> {
    let doc_uuid = Uuid::parse_str(&doc_id).map_err(|_| axum::http::StatusCode::BAD_REQUEST)?;

    let blobs = storage::get_blobs_for_doc(&state.db, doc_uuid)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;

    let versions = blobs.into_iter().map(|b| DocVersion {
        id: b.id.to_string(),
        vector_clock: b.vector_clock,
        created_at: None, // DocBlob doesn't carry created_at; simplified
    }).collect();

    Ok(Json(DocDetail {
        doc_id,
        versions,
    }))
}

pub async fn api_push(
    State(state): State<AppState>,
    Path(doc_id): Path<String>,
    Json(body): Json<PushRequest>,
) -> Result<Json<PushResponse>, axum::http::StatusCode> {
    let doc_uuid = Uuid::parse_str(&doc_id).map_err(|_| axum::http::StatusCode::BAD_REQUEST)?;

    let blob_bytes = base64::engine::general_purpose::STANDARD
        .decode(&body.encrypted_blob)
        .map_err(|_| axum::http::StatusCode::BAD_REQUEST)?;

    let user_id = Uuid::new_v4(); // simplified; in production extract from JWT
    let vc = body.vector_clock.unwrap_or(serde_json::Value::Null);

    storage::store_blob(&state.db, doc_uuid, user_id, &vc, &blob_bytes)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;

    // Broadcast to WebSocket subscribers
    if let Ok(channels) = state.doc_channels.lock() {
        if let Some(tx) = channels.get(&doc_id) {
            let _ = tx.send(blob_bytes);
        }
    }

    Ok(Json(PushResponse {
        ok: true,
        version_id: Uuid::new_v4().to_string(),
    }))
}

pub async fn api_pull(
    State(state): State<AppState>,
    Path(doc_id): Path<String>,
    Query(_query): Query<PullQuery>,
) -> Result<Json<PullResponse>, axum::http::StatusCode> {
    let doc_uuid = Uuid::parse_str(&doc_id).map_err(|_| axum::http::StatusCode::BAD_REQUEST)?;

    let blobs = storage::get_blobs_for_doc(&state.db, doc_uuid)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;

    let updates = blobs.into_iter().map(|b| {
        let encoded = base64::engine::general_purpose::STANDARD.encode(&b.encrypted_blob);
        PullUpdate {
            id: b.id.to_string(),
            encrypted_blob: encoded,
            vector_clock: b.vector_clock,
            created_at: None,
        }
    }).collect();

    Ok(Json(PullResponse { updates }))
}

pub async fn api_stats(State(state): State<AppState>) -> Json<StatsResponse> {
    let total_documents: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT doc_id) FROM doc_blobs"
    )
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    let total_versions: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM doc_blobs"
    )
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    let total_users: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM users"
    )
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    Json(StatsResponse {
        total_documents,
        total_versions,
        total_users,
    })
}

// ── Web Clipper endpoint ──────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ClipRequest {
    pub title: String,
    pub content: String,
    pub folder: Option<String>,
    pub tags: Option<Vec<String>>,
    pub source_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ClipResponse {
    pub ok: bool,
    pub doc_id: String,
}

/// Accept web clips from the browser extension.
/// Stores the clipped content as an encrypted blob (placeholder — in production,
/// the server would forward to a connected desktop client or store for later sync).
pub async fn api_clip(
    State(state): State<AppState>,
    Json(body): Json<ClipRequest>,
) -> Result<Json<ClipResponse>, axum::http::StatusCode> {
    let doc_id = Uuid::new_v4();
    let user_id = Uuid::new_v4(); // simplified; in production extract from JWT

    // Serialize the clip as JSON, then store as a blob
    let clip_data = serde_json::json!({
        "title": body.title,
        "content": body.content,
        "folder": body.folder,
        "tags": body.tags,
        "source_url": body.source_url,
        "clipped_at": chrono::Utc::now().to_rfc3339(),
    });

    let blob_bytes = serde_json::to_vec(&clip_data)
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;

    let vector_clock = serde_json::json!({"version": 1});

    storage::store_blob(&state.db, doc_id, user_id, &vector_clock, &blob_bytes)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;

    // Broadcast to WebSocket subscribers
    if let Ok(channels) = state.doc_channels.lock() {
        if let Some(tx) = channels.get(&doc_id.to_string()) {
            let _ = tx.send(blob_bytes.clone());
        }
    }

    Ok(Json(ClipResponse {
        ok: true,
        doc_id: doc_id.to_string(),
    }))
}
