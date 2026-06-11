use axum::extract::ws::{WebSocket, Message};
use tokio::sync::broadcast;
use crate::server::AppState;
use crate::auth::AuthUser;
use futures_util::{SinkExt, StreamExt};
use serde::{Serialize, Deserialize};
use base64::Engine;
use novanote_core::protobuf::SyncMessage;

#[derive(Debug, Serialize, Deserialize)]
struct ClientMessage {
    #[serde(rename = "type")]
    msg_type: String,
    doc_id: String,
    encrypted_blob: Option<String>,  // base64
    vector_clock: Option<serde_json::Value>,
}

pub async fn handle_socket(socket: WebSocket, state: AppState, doc_id: String, auth_user: AuthUser) {
    let (mut sender, mut receiver) = socket.split();

    let tx = {
        let mut channels = state.doc_channels.write().await;
        channels.entry(doc_id.clone()).or_insert_with(|| {
            let (tx, _) = broadcast::channel(100);
            tx
        }).clone()
    };

    let mut rx = tx.subscribe();

    // Track whether the connected client prefers Protobuf (set on first binary message)
    let mut _client_uses_protobuf = false;

    // Spawn task to forward broadcast messages to this websocket
    let send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            let data: Vec<u8> = msg;
            if sender.send(Message::Binary(data.into())).await.is_err() {
                break;
            }
        }
    });

    // Recv loop: handle incoming messages from this client
    while let Some(Ok(msg)) = receiver.next().await {
        match msg {
            Message::Text(text) => {
                // Legacy JSON text messages (backward compatibility)
                if let Ok(client_msg) = serde_json::from_str::<ClientMessage>(&text) {
                    if client_msg.msg_type == "update" {
                        if let Some(blob) = &client_msg.encrypted_blob {
                            let blob_bytes = base64_decode(blob);

                            // Store in DB with the authenticated user_id
                            let doc_uuid = uuid::Uuid::parse_str(&client_msg.doc_id).unwrap_or_default();
                            let _ = sqlx::query(
                                "INSERT INTO doc_blobs (doc_id, user_id, vector_clock, encrypted_blob) VALUES ($1, $2, $3, $4)"
                            )
                            .bind(doc_uuid)
                            .bind(auth_user.user_id)
                            .bind(client_msg.vector_clock.unwrap_or(serde_json::Value::Null))
                            .bind(&blob_bytes)
                            .execute(&state.db).await;

                            // Broadcast to ALL connected clients via channel
                            let _ = tx.send(blob_bytes);
                        }
                    }
                }
            }
            Message::Binary(data) => {
                // Binary message: try Protobuf-prefixed SyncMessage first
                if let Ok(sync_msg) = SyncMessage::decode_prefixed(&data) {
                    _client_uses_protobuf = true;
                    match sync_msg.msg_type.as_str() {
                        "auth" => {
                            // Authentication already handled by middleware — just confirm
                            let auth_ok = SyncMessage {
                                msg_type: "auth_ok".to_string(),
                                auth: None,
                                auth_ok: Some(novanote_core::protobuf::AuthResponse {
                                    ok: true,
                                    error: None,
                                }),
                                step1: None,
                                step2: None,
                                awareness: None,
                            };
                            let response_bytes = auth_ok.encode_prefixed();
                            let _ = tx.send(response_bytes);
                        }
                        "update" => {
                            if let Some(step2) = &sync_msg.step2 {
                                for update_bytes in &step2.updates {
                                    // Store the update in DB with the authenticated user_id
                                    let doc_uuid = uuid::Uuid::parse_str(&step2.doc_id).unwrap_or_default();
                                    let _ = sqlx::query(
                                        "INSERT INTO doc_blobs (doc_id, user_id, vector_clock, encrypted_blob) VALUES ($1, $2, $3, $4)"
                                    )
                                    .bind(doc_uuid)
                                    .bind(auth_user.user_id)
                                    .bind(serde_json::Value::Null)
                                    .bind(update_bytes.as_slice())
                                    .execute(&state.db).await;

                                    // Broadcast to ALL connected clients via channel
                                    let _ = tx.send(update_bytes.clone());
                                }
                            }
                        }
                        _ => {}
                    }
                } else {
                    // Fallback: relay raw binary to all other clients
                    let _ = tx.send(data.to_vec());
                }
            }
            Message::Close(_) => {
                break;
            }
            _ => {}
        }
    }

    send_task.abort();
}

fn base64_decode(s: &str) -> Vec<u8> {
    base64::engine::general_purpose::STANDARD.decode(s).unwrap_or_default()
}