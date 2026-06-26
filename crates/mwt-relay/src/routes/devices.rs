use axum::{extract::State, http::StatusCode, Json};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use crate::{store::devices::DeviceRecord, AppState};

#[derive(Deserialize)]
pub struct AddDeviceRequest {
    pub pin: String,
    pub new_device_id: String,
    /// Ed25519 signing public key of the new device (hex)
    pub new_device_sign_key: String,
    /// Authorising device ID (the one approving the add)
    pub authorising_device_id: String,
    /// Ed25519 signature of (new_device_id || new_device_sign_key) by authorising device's key
    pub authorisation_sig: String,
}

#[derive(Serialize)]
pub struct AddDeviceResponse {
    pub ok: bool,
}

pub async fn add_device(
    State(state): State<AppState>,
    Json(req): Json<AddDeviceRequest>,
) -> Result<Json<AddDeviceResponse>, StatusCode> {
    let account = state.accounts.get(&req.pin).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    // Enforce per-tier device cap
    if account.device_ids.len() >= account.tier.max_devices() as usize {
        return Err(StatusCode::FORBIDDEN);
    }

    // Verify authorisation signature from the existing device
    let auth_device = state.devices.get(&req.pin, &req.authorising_device_id).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let vk_bytes = hex::decode(&auth_device.sign_key).map_err(|_| StatusCode::BAD_REQUEST)?;
    let vk_arr: [u8; 32] = vk_bytes.try_into().map_err(|_| StatusCode::BAD_REQUEST)?;
    let vk = VerifyingKey::from_bytes(&vk_arr).map_err(|_| StatusCode::BAD_REQUEST)?;

    let sig_bytes = hex::decode(&req.authorisation_sig).map_err(|_| StatusCode::BAD_REQUEST)?;
    let sig_arr: [u8; 64] = sig_bytes.try_into().map_err(|_| StatusCode::BAD_REQUEST)?;
    let sig = Signature::from_bytes(&sig_arr);

    // Signed payload: new_device_id || new_device_sign_key (as bytes)
    let mut signed_payload = req.new_device_id.as_bytes().to_vec();
    signed_payload.extend_from_slice(req.new_device_sign_key.as_bytes());
    vk.verify(&signed_payload, &sig).map_err(|_| StatusCode::UNAUTHORIZED)?;

    // Register the new device
    let device = DeviceRecord {
        device_id: req.new_device_id.clone(),
        account_pin: req.pin.clone(),
        sign_key: req.new_device_sign_key,
        added_at: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
    };
    state.devices.put(&device).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Add to account's device list
    let mut account = account;
    account.device_ids.push(req.new_device_id.clone());
    state.accounts.put(&account).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    tracing::info!(pin = %req.pin, device = %req.new_device_id, "device added");
    Ok(Json(AddDeviceResponse { ok: true }))
}

#[derive(Deserialize)]
pub struct RevokeDeviceRequest {
    pub pin: String,
    pub target_device_id: String,
    /// Ed25519 signature by the account's identity key (not a device key).
    /// Payload signed: "revoke:" || target_device_id
    /// This ensures a compromised relay cannot forge revocations.
    pub identity_sig: String,
}

#[derive(Serialize)]
pub struct RevokeDeviceResponse {
    pub ok: bool,
}

pub async fn revoke_device(
    State(state): State<AppState>,
    Json(req): Json<RevokeDeviceRequest>,
) -> Result<Json<RevokeDeviceResponse>, StatusCode> {
    let account = state.accounts.get(&req.pin).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    // Verify identity key signature — must come from the account root key
    let vk_bytes = hex::decode(&account.sign_key).map_err(|_| StatusCode::BAD_REQUEST)?;
    let vk_arr: [u8; 32] = vk_bytes.try_into().map_err(|_| StatusCode::BAD_REQUEST)?;
    let vk = VerifyingKey::from_bytes(&vk_arr).map_err(|_| StatusCode::BAD_REQUEST)?;

    let sig_bytes = hex::decode(&req.identity_sig).map_err(|_| StatusCode::BAD_REQUEST)?;
    let sig_arr: [u8; 64] = sig_bytes.try_into().map_err(|_| StatusCode::BAD_REQUEST)?;
    let sig = Signature::from_bytes(&sig_arr);

    let signed_payload = format!("revoke:{}", req.target_device_id);
    vk.verify(signed_payload.as_bytes(), &sig).map_err(|_| StatusCode::UNAUTHORIZED)?;

    // Remove device record
    state.devices.remove(&req.pin, &req.target_device_id).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Update account device list
    let mut account = account;
    account.device_ids.retain(|d| d != &req.target_device_id);
    state.accounts.put(&account).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Purge pending message queue for the revoked device
    let subject = format!("mwt.inbox.{}.{}", req.pin, req.target_device_id);
    let _ = state.nats.publish(
        format!("mwt.revoke.{}.{}", req.pin, req.target_device_id),
        // Signed self-destruct command — client receives this and wipes local data
        req.identity_sig.clone().into(),
    ).await;

    // Purge inbox for revoked device from JetStream
    // In production: use js.purge_stream_subject() — placeholder publish here
    tracing::info!(pin = %req.pin, device = %req.target_device_id, "device revoked");
    drop(subject);

    Ok(Json(RevokeDeviceResponse { ok: true }))
}
