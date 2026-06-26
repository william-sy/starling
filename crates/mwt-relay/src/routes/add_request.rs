use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use crate::AppState;

/// An add request is a small sealed payload the relay routes without reading.
/// The relay sees: sender PIN, recipient PIN, and an opaque encrypted blob.
/// Content (display name, introduction context) is encrypted for the recipient.
#[derive(Deserialize)]
pub struct AddRequestPayload {
    pub sender_pin: String,
    pub recipient_pin: String,
    /// Encrypted for recipient's identity key — relay cannot read
    pub sealed_payload: String, // base64
}

#[derive(Serialize)]
pub struct AddRequestResponse {
    pub ok: bool,
}

pub async fn send_add_request(
    State(state): State<AppState>,
    Json(req): Json<AddRequestPayload>,
) -> Result<Json<AddRequestResponse>, StatusCode> {
    tracing::info!(sender = %req.sender_pin, recipient = %req.recipient_pin, "add-request received");

    // Both accounts must exist
    let sender_exists = state.accounts.exists(&req.sender_pin).await
        .map_err(|e| { tracing::error!("accounts.exists sender failed: {e}"); StatusCode::INTERNAL_SERVER_ERROR })?;
    let recipient_exists = state.accounts.exists(&req.recipient_pin).await
        .map_err(|e| { tracing::error!("accounts.exists recipient failed: {e}"); StatusCode::INTERNAL_SERVER_ERROR })?;

    if !sender_exists || !recipient_exists {
        tracing::warn!(sender_exists, recipient_exists, "add-request rejected: account not found");
        return Err(StatusCode::NOT_FOUND);
    }

    // Deliver via JetStream so the message is durable — offline recipients
    // receive it on next connect via their durable consumer replay.
    let subject = format!("mwt.inbox.{}", req.recipient_pin);
    state.js.publish(subject, req.sealed_payload.clone().into()).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    tracing::info!(
        sender = %req.sender_pin,
        recipient = %req.recipient_pin,
        "add request routed"
    );

    Ok(Json(AddRequestResponse { ok: true }))
}
