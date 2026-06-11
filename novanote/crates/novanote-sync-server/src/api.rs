//! REST API handlers for the NovaNote sync server
//! Provides JSON endpoints for health, document management, push/pull, and stats.

use axum::{
    Json,
    extract::{Path, State, Query, Extension},
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use base64::Engine;
use uuid::Uuid;
use crate::auth::{self, AuthUser};
use crate::server::AppState;
use crate::storage;
use crate::totp;

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
    Extension(auth_user): Extension<AuthUser>,
    Path(doc_id): Path<String>,
    Json(body): Json<PushRequest>,
) -> Result<Json<PushResponse>, axum::http::StatusCode> {
    let doc_uuid = Uuid::parse_str(&doc_id).map_err(|_| axum::http::StatusCode::BAD_REQUEST)?;

    let blob_bytes = base64::engine::general_purpose::STANDARD
        .decode(&body.encrypted_blob)
        .map_err(|_| axum::http::StatusCode::BAD_REQUEST)?;

    let user_id = auth_user.user_id;
    let vc = body.vector_clock.unwrap_or(serde_json::Value::Null);

    let version_id = storage::store_blob(&state.db, doc_uuid, user_id, &vc, &blob_bytes)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;

    // Broadcast to WebSocket subscribers
    if let Some(tx) = state.doc_channels.read().await.get(&doc_id) {
        let _ = tx.send(blob_bytes);
    }

    Ok(Json(PushResponse {
        ok: true,
        version_id: version_id.to_string(),
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
    Extension(auth_user): Extension<AuthUser>,
    Json(body): Json<ClipRequest>,
) -> Result<Json<ClipResponse>, axum::http::StatusCode> {
    let doc_id = Uuid::new_v4();
    let user_id = auth_user.user_id;

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
    if let Some(tx) = state.doc_channels.read().await.get(&doc_id.to_string()) {
        let _ = tx.send(blob_bytes.clone());
    }

    Ok(Json(ClipResponse {
        ok: true,
        doc_id: doc_id.to_string(),
    }))
}

// ── WeChat Clip endpoint ──────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct WeChatClipRequest {
    pub html: String,
    pub url: String,
}

pub async fn api_wechat_clip(
    Json(body): Json<WeChatClipRequest>,
) -> Result<Json<ClipResponse>, axum::http::StatusCode> {
    let article = novanote_core::parse_wechat_article(&body.html, &body.url);
    let markdown = novanote_core::wechat_to_markdown(&article);

    // Store as a clipped note
    let doc_id = Uuid::new_v4();
    let _clip_data = serde_json::json!({
        "title": article.title,
        "content": markdown,
        "folder": "wechat",
        "tags": ["wechat"],
        "source_url": article.url,
    });

    Ok(Json(ClipResponse {
        ok: true,
        doc_id: doc_id.to_string(),
    }))
}

// ── Auth endpoints ───────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user_id: String,
}

/// Register a new user and return a JWT.
pub async fn api_register(
    State(state): State<AppState>,
    Json(body): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, (axum::http::StatusCode, String)> {
    // Check if username already exists
    let existing: Option<uuid::Uuid> = sqlx::query_scalar("SELECT id FROM users WHERE username = $1")
        .bind(&body.username)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if existing.is_some() {
        return Err((axum::http::StatusCode::CONFLICT, "Username already exists".to_string()));
    }

    // Hash the password with Argon2id
    let password_hash = hash_password(&body.password);

    let user_id = Uuid::new_v4();
    sqlx::query("INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)")
        .bind(user_id)
        .bind(&body.username)
        .bind(&password_hash)
        .execute(&state.db)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let token = auth::create_token(&user_id.to_string(), &state.jwt_secret)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(AuthResponse {
        token,
        user_id: user_id.to_string(),
    }))
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

/// Validate credentials and return a JWT.
pub async fn api_login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, (axum::http::StatusCode, String)> {
    let row = sqlx::query("SELECT id, password_hash FROM users WHERE username = $1")
        .bind(&body.username)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let row = match row {
        Some(r) => r,
        None => return Err((axum::http::StatusCode::UNAUTHORIZED, "Invalid credentials".to_string())),
    };

    let user_id: Uuid = row.get("id");
    let stored_hash: String = row.get("password_hash");

    if !verify_password(&body.password, &stored_hash) {
        return Err((axum::http::StatusCode::UNAUTHORIZED, "Invalid credentials".to_string()));
    }

    let token = auth::create_token(&user_id.to_string(), &state.jwt_secret)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(AuthResponse {
        token,
        user_id: user_id.to_string(),
    }))
}

/// Hash password using Argon2id (password-hashing best practice).
/// Returns "salt:hash" as base64-encoded string.
fn hash_password(password: &str) -> String {
    use rand::Rng;
    let mut salt = [0u8; 16];
    rand::thread_rng().fill(&mut salt);
    let argon2 = argon2::Argon2::new(
        argon2::Algorithm::Argon2id,
        argon2::Version::V0x13,
        argon2::Params::default(),
    );
    let mut hash = [0u8; 32];
    argon2.hash_password_into(password.as_bytes(), &salt, &mut hash)
        .expect("Failed to hash password");
    let salt_b64 = base64::engine::general_purpose::STANDARD.encode(&salt);
    let hash_b64 = base64::engine::general_purpose::STANDARD.encode(&hash);
    format!("{}:{}", salt_b64, hash_b64)
}

/// Verify password against stored Argon2id hash.
fn verify_password(password: &str, stored: &str) -> bool {
    let parts: Vec<&str> = stored.splitn(2, ':').collect();
    if parts.len() != 2 { return false; }
    let salt = match base64::engine::general_purpose::STANDARD.decode(parts[0]) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let expected_hash = match base64::engine::general_purpose::STANDARD.decode(parts[1]) {
        Ok(h) => h,
        Err(_) => return false,
    };
    let argon2 = argon2::Argon2::new(
        argon2::Algorithm::Argon2id,
        argon2::Version::V0x13,
        argon2::Params::default(),
    );
    let mut hash = [0u8; 32];
    if argon2.hash_password_into(password.as_bytes(), &salt, &mut hash).is_err() {
        return false;
    }
    hash == expected_hash.as_slice()
}

// ── TOTP Two-Factor Authentication endpoints ──────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct TotpSetupRequest {
    pub user_id: String,
}

#[derive(Debug, Serialize)]
pub struct TotpSetupResponse {
    pub secret: String,
    pub otpauth_uri: String,
}

pub async fn api_totp_setup(
    State(state): State<crate::server::AppState>,
    Json(body): Json<TotpSetupRequest>,
) -> Result<Json<TotpSetupResponse>, (axum::http::StatusCode, String)> {
    let user_id = uuid::Uuid::parse_str(&body.user_id)
        .map_err(|_| (axum::http::StatusCode::BAD_REQUEST, "Invalid user_id".into()))?;

    let secret = totp::generate_secret();
    let uri = totp::generate_otpauth_uri(&secret, &body.user_id, "NovaNote");

    // Store TOTP secret in the database
    storage::store_totp_secret(&state.db, user_id, &secret)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(TotpSetupResponse {
        secret,
        otpauth_uri: uri,
    }))
}

#[derive(Debug, Deserialize)]
pub struct TotpVerifyRequest {
    pub user_id: String,
    pub code: String,
}

#[derive(Debug, Serialize)]
pub struct TotpVerifyResponse {
    pub valid: bool,
}

pub async fn api_totp_verify(
    State(state): State<crate::server::AppState>,
    Json(body): Json<TotpVerifyRequest>,
) -> Result<Json<TotpVerifyResponse>, (axum::http::StatusCode, String)> {
    let user_id = uuid::Uuid::parse_str(&body.user_id)
        .map_err(|_| (axum::http::StatusCode::BAD_REQUEST, "Invalid user_id".into()))?;

    // Read TOTP secret from database
    let secret = storage::get_totp_secret(&state.db, user_id)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let secret = match secret {
        Some(s) => s,
        None => return Ok(Json(TotpVerifyResponse { valid: false })),
    };

    let valid = totp::verify_totp(&secret, &body.code).unwrap_or(false);
    Ok(Json(TotpVerifyResponse { valid }))
}
