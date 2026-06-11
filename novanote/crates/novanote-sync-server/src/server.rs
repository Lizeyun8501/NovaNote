use axum::{Router, routing::{get, post}, Json, extract::Path, extract::State, extract::ws::WebSocketUpgrade, middleware, Extension};
use tokio::sync::RwLock;
use std::sync::Arc;
use std::collections::HashMap;
use tokio::sync::broadcast;
use crate::ws;
use crate::auth;
use serde::{Serialize, Deserialize};

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub jwt_secret: String,
    // Channel per doc_id for broadcasting updates to connected clients
    pub doc_channels: Arc<RwLock<HashMap<String, broadcast::Sender<Vec<u8>>>>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
}

pub async fn run(database_url: &str, bind_addr: &str, jwt_secret: &str) {
    // Connect to PostgreSQL
    let pool = sqlx::PgPool::connect(database_url).await
        .expect("Failed to connect to PostgreSQL");

    // Run migrations
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL DEFAULT '',
            totp_secret TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    "#).execute(&pool).await.ok();

    // Add totp_secret column if it doesn't exist (for existing databases)
    sqlx::query(r#"
        ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT
    "#).execute(&pool).await.ok();

    // Add password_hash column if it doesn't exist (for existing databases)
    sqlx::query(r#"
        ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT ''
    "#).execute(&pool).await.ok();

    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS doc_blobs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            doc_id UUID NOT NULL,
            user_id UUID NOT NULL REFERENCES users(id),
            vector_clock JSONB NOT NULL DEFAULT '{}',
            encrypted_blob BYTEA NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    "#).execute(&pool).await.ok();

    sqlx::query(r#"
        CREATE INDEX IF NOT EXISTS idx_doc_blobs_doc_id ON doc_blobs(doc_id)
    "#).execute(&pool).await.ok();

    sqlx::query(r#"
        CREATE INDEX IF NOT EXISTS idx_doc_blobs_user_id ON doc_blobs(user_id)
    "#).execute(&pool).await.ok();

    sqlx::query(r#"
        CREATE INDEX IF NOT EXISTS idx_doc_blobs_doc_user ON doc_blobs(doc_id, user_id)
    "#).execute(&pool).await.ok();

    let state = AppState {
        db: pool,
        jwt_secret: jwt_secret.to_string(),
        doc_channels: Arc::new(RwLock::new(HashMap::new())),
    };

    // Public routes (no auth required)
    let public_routes = Router::new()
        .route("/health", get(health))
        // API v1 public routes
        .route("/api/v1/health", get(crate::api::api_health))
        .route("/api/v1/auth/register", post(crate::api::api_register))
        .route("/api/v1/auth/login", post(crate::api::api_login))
        .route("/api/v1/totp/setup", post(crate::api::api_totp_setup));

    // Protected routes (auth middleware applied)
    let protected_routes = Router::new()
        .route("/ws/{doc_id}", get(ws_handler))
        .route("/api/v1/docs", get(crate::api::api_list_docs))
        .route("/api/v1/docs/{doc_id}", get(crate::api::api_get_doc))
        .route("/api/v1/docs/{doc_id}/push", post(crate::api::api_push))
        .route("/api/v1/docs/{doc_id}/pull", get(crate::api::api_pull))
        .route("/api/v1/stats", get(crate::api::api_stats))
        .route("/api/v1/clip", post(crate::api::api_clip))
        .route("/api/v1/clip/wechat", post(crate::api::api_wechat_clip))
        .route("/api/v1/totp/verify", post(crate::api::api_totp_verify))
        .layer(middleware::from_fn_with_state(state.clone(), auth::auth_middleware));

    let app = Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(bind_addr).await
        .expect("Failed to bind");

    tracing::info!("Sync server listening on {}", bind_addr);

    axum::serve(listener, app).await.unwrap();
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Extension(auth_user): Extension<crate::auth::AuthUser>,
    Path(doc_id): Path<String>,
) -> impl axum::response::IntoResponse {
    ws.on_upgrade(move |socket| ws::handle_socket(socket, state, doc_id, auth_user))
}
