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

pub async fn store_blob(pool: &sqlx::PgPool, doc_id: Uuid, user_id: Uuid, vector_clock: &Value, encrypted_blob: &[u8]) -> Result<(), sqlx::Error> {
    sqlx::query(r#"
        INSERT INTO doc_blobs (doc_id, user_id, vector_clock, encrypted_blob)
        VALUES ($1, $2, $3, $4)
    "#)
    .bind(doc_id)
    .bind(user_id)
    .bind(vector_clock)
    .bind(encrypted_blob)
    .execute(pool)
    .await?;
    Ok(())
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
    let row = sqlx::query("SELECT id FROM users WHERE username = $1")
        .bind(username)
        .fetch_optional(pool).await?;
    if let Some(row) = row {
        let id: Uuid = row.get("id");
        return Ok(id);
    }
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO users (id, username) VALUES ($1, $2)")
        .bind(id)
        .bind(username)
        .execute(pool).await?;
    Ok(id)
}