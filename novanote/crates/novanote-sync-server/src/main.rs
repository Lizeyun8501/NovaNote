use tracing_subscriber;

mod server;
mod auth;
mod storage;
mod ws;
mod api;
mod totp;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    dotenvy::dotenv().ok();

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://postgres:postgres@localhost:5432/novanote_sync".to_string());
    let bind_addr = std::env::var("BIND_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:3000".to_string());
    let jwt_secret = std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| uuid::Uuid::new_v4().to_string());

    tracing::info!("Starting NovaNote Sync Server on {}", bind_addr);

    server::run(&database_url, &bind_addr, &jwt_secret).await;
}