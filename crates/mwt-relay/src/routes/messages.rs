use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use futures::{SinkExt, StreamExt};
use crate::AppState;

/// Resolve sender PIN from the Authorization header.
/// Tries send_token lookup first, then falls back to treating the value as a PIN in dev mode.
async fn resolve_sender(headers: &HeaderMap, state: &AppState) -> Option<String> {
    let raw = headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|s| s.trim().to_owned())?;

    if state.config.dev_no_auth {
        // Try send_token lookup first (new clients)
        if let Ok(Some(pin)) = state.send_tokens.get_pin(&raw).await {
            return Some(pin);
        }
        // Fallback: treat bearer value as PIN directly (clients without send_token yet)
        if state.accounts.exists(&raw).await.unwrap_or(false) {
            return Some(raw);
        }
        None
    } else {
        state.send_tokens.get_pin(&raw).await.ok().flatten()
    }
}

#[derive(Deserialize)]
pub struct SendMessageRequest {
    pub recipient_pin: String,
    /// Base64-encoded ciphertext blob -- relay treats as opaque bytes
    pub ciphertext: String,
}

#[derive(Serialize)]
pub struct SendMessageResponse {
    pub ok: bool,
}

/// Send an encrypted blob to all connected devices of a recipient PIN.
/// The relay routes the blob; it cannot read the content.
pub async fn send_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<SendMessageRequest>,
) -> Result<Json<SendMessageResponse>, StatusCode> {
    let sender_pin = resolve_sender(&headers, &state).await
        .ok_or_else(|| { tracing::warn!("send_message: unauthorized (bad token)"); StatusCode::UNAUTHORIZED })?;

    let account = state.accounts.get(&sender_pin).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::UNAUTHORIZED)?;

    // Rate limiting is intentionally not enforced on self-hosted relays.
    // Re-enable when operating a shared multi-tenant relay.

    if !state.accounts.exists(&req.recipient_pin).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? {
        return Err(StatusCode::NOT_FOUND);
    }

    // Reject values that could act as NATS subject wildcards
    if req.recipient_pin.contains('.') || req.recipient_pin.contains('*') || req.recipient_pin.contains('>') {
        return Err(StatusCode::BAD_REQUEST);
    }

    let subject = format!("mwt.inbox.{}", req.recipient_pin);
    state.js.publish(subject, req.ciphertext.into()).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SendMessageResponse { ok: true }))
}

/// WebSocket connection query parameters
#[derive(Deserialize)]
pub struct ConnectQuery {
    pub pin:       String,
    pub device_id: String,
    /// Session token. In dev-no-auth mode, pass the PIN itself.
    pub token:     String,
    /// Last JetStream sequence the client received; replay starts from seq+1.
    pub last_seq:  Option<u64>,
}

/// WebSocket upgrade -- each connected device gets a durable JetStream consumer for offline replay.
pub async fn ws_connect(
    ws: WebSocketUpgrade,
    Query(params): Query<ConnectQuery>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let ok = if state.config.dev_no_auth {
        // Accept send_token (new clients) or PIN (legacy dev-only fallback)
        if let Ok(Some(_)) = state.send_tokens.get_pin(&params.token).await {
            true
        } else {
            params.token == params.pin
        }
    } else {
        state.send_tokens.get_pin(&params.token).await.ok().flatten().is_some()
    };

    if !ok {
        return StatusCode::UNAUTHORIZED.into_response();
    }

    ws.on_upgrade(move |socket| handle_ws(socket, params, state))
}

async fn handle_ws(socket: WebSocket, params: ConnectQuery, state: AppState) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Consumer name: stable per pin+device; must only contain alphanumeric and hyphens
    let consumer_name: String = format!("{}-{}", params.pin, params.device_id)
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '_' })
        .collect();

    let stream = match state.js.get_stream("mwt-inbox").await {
        Ok(s)  => s,
        Err(e) => { tracing::error!("stream get failed: {e}"); return; }
    };

    let deliver_policy = match params.last_seq {
        Some(seq) if seq > 0 => async_nats::jetstream::consumer::DeliverPolicy::ByStartSequence {
            start_sequence: seq + 1,
        },
        _ => async_nats::jetstream::consumer::DeliverPolicy::All,
    };

    let consumer_cfg = async_nats::jetstream::consumer::push::Config {
        durable_name:    Some(consumer_name.clone()),
        deliver_subject: format!("_mwt.deliver.{consumer_name}"),
        filter_subject:  format!("mwt.inbox.{}", params.pin),
        ack_policy:      async_nats::jetstream::consumer::AckPolicy::Explicit,
        deliver_policy,
        ..Default::default()
    };

    let consumer = match stream.get_or_create_consumer(&consumer_name, consumer_cfg).await {
        Ok(c)  => c,
        Err(e) => { tracing::error!("consumer create failed: {e}"); return; }
    };

    let mut msgs = match consumer.messages().await {
        Ok(m)  => m,
        Err(e) => { tracing::error!("consumer messages failed: {e}"); return; }
    };

    tracing::info!(pin = %params.pin, device = %params.device_id, "device connected");

    let forward = async {
        while let Some(Ok(msg)) = msgs.next().await {
            let payload = msg.payload.to_vec();
            if ws_sender.send(Message::Binary(payload)).await.is_err() {
                break;
            }
            let _ = msg.ack().await;
        }
    };

    let receive = async {
        while let Some(Ok(msg)) = ws_receiver.next().await {
            if let Message::Close(_) = msg { break; }
        }
    };

    tokio::select! {
        _ = forward => {}
        _ = receive => {}
    }

    tracing::info!(pin = %params.pin, device = %params.device_id, "device disconnected");
}
