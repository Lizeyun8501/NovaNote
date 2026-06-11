use serde::{Serialize, Deserialize};
use serde_json::Value;
use uuid::Uuid;
use sqlx::FromRow;
use sqlx::Row;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct DocBlob {
    pub id: Uuid,
    pub doc_id: Uuid,
    pub user_id: Uuid,
    pub vector_clock: Value,
    pub encrypted_blob: Vec<u8>,
}

pub async fn store_blob(pool: &sqlx::PgPool, doc_id: Uuid, user_id: Uuid, vector_clock: &Value, encrypted_blob: &[u8]) -> Result<Uuid, sqlx::Error> {
    let row = sqlx::query(r#"
        INSERT INTO doc_blobs (doc_id, user_id, vector_clock, encrypted_blob)
        VALUES ($1, $2, $3, $4)
        RETURNING id
    "#)
    .bind(doc_id)
    .bind(user_id)
    .bind(vector_clock)
    .bind(encrypted_blob)
    .fetch_one(pool)
    .await?;

    let id: Uuid = row.get("id");
    Ok(id)
}

pub async fn get_blobs_for_doc(pool: &sqlx::PgPool, doc_id: Uuid) -> Result<Vec<DocBlob>, sqlx::Error> {
    sqlx::query_as(
        "SELECT id, doc_id, user_id, vector_clock, encrypted_blob FROM doc_blobs WHERE doc_id = $1 ORDER BY created_at ASC"
    )
    .bind(doc_id)
    .fetch_all(pool)
    .await
}

pub async fn get_or_create_user(pool: &sqlx::PgPool, username: &str) -> Result<Uuid, sqlx::Error> {
    // Use INSERT ... ON CONFLICT to avoid TOCTOU race condition
    let id = Uuid::new_v4();
    let row = sqlx::query(
        "INSERT INTO users (id, username) VALUES ($1, $2) ON CONFLICT (username) DO UPDATE SET username = excluded.username RETURNING id"
    )
    .bind(id)
    .bind(username)
    .fetch_one(pool)
    .await?;
    let result: Uuid = row.get("id");
    Ok(result)
}

/// Store a TOTP secret for a user.
pub async fn store_totp_secret(pool: &sqlx::PgPool, user_id: Uuid, secret: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE users SET totp_secret = $1 WHERE id = $2")
        .bind(secret)
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Retrieve a user's TOTP secret.
pub async fn get_totp_secret(pool: &sqlx::PgPool, user_id: Uuid) -> Result<Option<String>, sqlx::Error> {
    let row = sqlx::query("SELECT totp_secret FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
    Ok(row.and_then(|r| r.get(0)))
}