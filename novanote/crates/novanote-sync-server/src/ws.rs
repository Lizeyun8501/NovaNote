use axum::extract::ws::{WebSocket, Message};
use tokio::sync::broadcast;
use crate::server::AppState;
use futures_util::{SinkExt, StreamExt};
use serde::{Serialize, Deserialize};
use base64::Engine;

#[derive(Debug, Serialize, Deserialize)]
struct ClientMessage {
    #[serde(rename = "type")]
    msg_type: String,
    doc_id: String,
    encrypted_blob: Option<String>,  // base64
    vector_clock: Option<serde_json::Value>,
}

pub async fn handle_socket(socket: WebSocket, state: AppState, doc_id: String) {
    let (mut sender, mut receiver) = socket.split();

    let tx = {
        let mut channels = state.doc_channels.lock().unwrap();
        channels.entry(doc_id.clone()).or_insert_with(|| {
            let (tx, _) = broadcast::channel(100);
            tx
        }).clone()
    };

    let mut rx = tx.subscribe();

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
                if let Ok(client_msg) = serde_json::from_str::<ClientMessage>(&text) {
                    if client_msg.msg_type == "update" {
                        if let Some(blob) = &client_msg.encrypted_blob {
                            // Store the blob and broadcast to other clients
                            let blob_bytes = base64_decode(blob);

                            // Store in DB (simplified)
                            let _ = sqlx::query(
                                "INSERT INTO doc_blobs (doc_id, user_id, vector_clock, encrypted_blob) VALUES ($1, $2, $3, $4)"
                            )
                            .bind(uuid::Uuid::parse_str(&client_msg.doc_id).unwrap_or_default())
                            .bind(uuid::Uuid::new_v4())
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
                // Binary message: relay to all other clients
                let _ = tx.send(data.to_vec());
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