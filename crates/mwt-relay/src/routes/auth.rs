use axum::{extract::State, http::StatusCode, Json};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use crate::AppState;

#[derive(Deserialize)]
pub struct ChallengeRequest {
    pub pin: String,
    pub device_id: String,
}

#[derive(Serialize)]
pub struct ChallengeResponse {
    pub nonce: String,
}

/// Step 1: client requests a challenge nonce to sign.
pub async fn request_challenge(
    State(state): State<AppState>,
    Json(req): Json<ChallengeRequest>,
) -> Result<Json<ChallengeResponse>, StatusCode> {
    // Device must be registered
    state.devices.get(&req.pin, &req.device_id).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let nonce = state.auth.issue_challenge(&req.pin, &req.device_id).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(ChallengeResponse { nonce }))
}

#[derive(Deserialize)]
pub struct VerifyRequest {
    pub pin: String,
    pub device_id: String,
    /// Ed25519 signature of the challenge nonce (hex)
    pub signature: String,
}

#[derive(Serialize)]
pub struct VerifyResponse {
    pub token: String,
}

/// Step 2: client returns the signed nonce → relay issues session token.
pub async fn verify_challenge(
    State(state): State<AppState>,
    Json(req): Json<VerifyRequest>,
) -> Result<Json<VerifyResponse>, StatusCode> {
    let device = state.devices.get(&req.pin, &req.device_id).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let challenge = state.auth.take_challenge(&req.pin, &req.device_id).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::UNAUTHORIZED)?; // expired or never issued

    // Verify signature
    let vk_bytes = hex::decode(&device.sign_key).map_err(|_| StatusCode::BAD_REQUEST)?;
    let vk_arr: [u8; 32] = vk_bytes.try_into().map_err(|_| StatusCode::BAD_REQUEST)?;
    let vk = VerifyingKey::from_bytes(&vk_arr).map_err(|_| StatusCode::BAD_REQUEST)?;

    let sig_bytes = hex::decode(&req.signature).map_err(|_| StatusCode::BAD_REQUEST)?;
    let sig_arr: [u8; 64] = sig_bytes.try_into().map_err(|_| StatusCode::BAD_REQUEST)?;
    let sig = Signature::from_bytes(&sig_arr);

    let nonce_bytes = hex::decode(&challenge.nonce).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    vk.verify(&nonce_bytes, &sig).map_err(|_| StatusCode::UNAUTHORIZED)?;

    let token = state.auth.create_session(&req.pin, &req.device_id).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    tracing::info!(pin = %req.pin, device = %req.device_id, "session created");
    Ok(Json(VerifyResponse { token }))
}

#[derive(Deserialize)]
pub struct LogoutRequest {
    pub token: String,
}

pub async fn logout(
    State(state): State<AppState>,
    Json(req): Json<LogoutRequest>,
) -> StatusCode {
    let _ = state.auth.revoke_session(&req.token).await;
    StatusCode::OK
}
