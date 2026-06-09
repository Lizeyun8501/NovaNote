use axum::{Router, routing::{get, post}, Json, extract::Path, extract::State, extract::ws::WebSocketUpgrade};
use std::sync::Arc;
use std::collections::HashMap;
use std::sync::Mutex;
use tokio::sync::broadcast;
use crate::ws;
use serde::{Serialize, Deserialize};

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub redis: redis::Client,
    pub jwt_secret: String,
    // Channel per doc_id for broadcasting updates to connected clients
    pub doc_channels: Arc<Mutex<HashMap<String, broadcast::Sender<Vec<u8>>>>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
}

pub async fn run(database_url: &str, redis_url: &str, bind_addr: &str, jwt_secret: &str) {
    // Connect to PostgreSQL
    let pool = sqlx::PgPool::connect(database_url).await
        .expect("Failed to connect to PostgreSQL");

    // Run migrations
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            username TEXT NOT NULL UNIQUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
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

    let redis_client = redis::Client::open(redis_url)
        .expect("Failed to connect to Redis");

    let state = AppState {
        db: pool,
        redis: redis_client,
        jwt_secret: jwt_secret.to_string(),
        doc_channels: Arc::new(Mutex::new(HashMap::new())),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/ws/{doc_id}", get(ws_handler))
        // REST API v1
        .route("/api/v1/health", get(crate::api::api_health))
        .route("/api/v1/docs", get(crate::api::api_list_docs))
        .route("/api/v1/docs/{doc_id}", get(crate::api::api_get_doc))
        .route("/api/v1/docs/{doc_id}/push", post(crate::api::api_push))
        .route("/api/v1/docs/{doc_id}/pull", get(crate::api::api_pull))
        .route("/api/v1/stats", get(crate::api::api_stats))
        .route("/api/v1/clip", post(crate::api::api_clip))
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
    Path(doc_id): Path<String>,
) -> impl axum::response::IntoResponse {
    ws.on_upgrade(move |socket| ws::handle_socket(socket, state, doc_id))
}