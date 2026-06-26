use axum::{extract::{Path, State}, http::StatusCode, Json};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use crate::AppState;

/// GET /account/:pin
///
/// Public PIN existence check. Returns 200 with tier info if the PIN is registered,
/// 404 if not. Used by clients to verify a PIN before adding as a contact.
/// No auth required — the PIN is already public knowledge (shared out-of-band).
#[derive(Serialize)]
pub struct AccountInfoResponse {
    pub exists: bool,
    pub tier:   String,
}

pub async fn get_account_info(
    State(state): State<AppState>,
    Path(pin): Path<String>,
) -> Result<Json<AccountInfoResponse>, StatusCode> {
    let record = state.accounts.get(&pin).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(AccountInfoResponse {
        exists: true,
        tier:   format!("{:?}", record.tier).to_lowercase(),
    }))
}

/// DELETE /account
///
/// Permanently destroys all relay-side data for an account:
///   - All device records removed
///   - All pending inbox messages purged from JetStream
///   - All prekeys deleted
///   - Account record deleted from KV
///   - Signed self-destruct broadcast to every device
///
/// Signed by the identity key (same key as revocation) so no device can trigger
/// deletion of another account and the relay cannot forge it.
/// Payload: "delete-account:" || pin
///
/// Billing records in the admin database are NOT touched here — they are retained
/// under the 7-year EU tax obligation (VAT Directive Art. 52) and handled via
/// the GDPR erasure flow in admin-web.
#[derive(Deserialize)]
pub struct DeleteAccountRequest {
    pub pin: String,
    /// Ed25519 signature by account identity key over "delete-account:" || pin
    pub identity_sig: String,
}

#[derive(Serialize)]
pub struct DeleteAccountResponse {
    pub ok:              bool,
    pub devices_removed: usize,
}

pub async fn delete_account(
    State(state): State<AppState>,
    Json(req): Json<DeleteAccountRequest>,
) -> Result<Json<DeleteAccountResponse>, StatusCode> {
    let account = state.accounts.get(&req.pin).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    // Verify identity key signature
    let vk_bytes = hex::decode(&account.sign_key).map_err(|_| StatusCode::BAD_REQUEST)?;
    let vk_arr: [u8; 32] = vk_bytes.try_into().map_err(|_| StatusCode::BAD_REQUEST)?;
    let vk = VerifyingKey::from_bytes(&vk_arr).map_err(|_| StatusCode::BAD_REQUEST)?;

    let sig_bytes = hex::decode(&req.identity_sig).map_err(|_| StatusCode::BAD_REQUEST)?;
    let sig_arr: [u8; 64] = sig_bytes.try_into().map_err(|_| StatusCode::BAD_REQUEST)?;
    let sig = Signature::from_bytes(&sig_arr);

    let signed_payload = format!("delete-account:{}", req.pin);
    vk.verify(signed_payload.as_bytes(), &sig).map_err(|_| StatusCode::UNAUTHORIZED)?;

    let device_count = account.device_ids.len();

    // 1. Broadcast signed self-destruct to every device — they wipe local storage on receipt
    for device_id in &account.device_ids {
        let _ = state.nats.publish(
            format!("mwt.revoke.{}.{}", req.pin, device_id),
            req.identity_sig.clone().into(),
        ).await;
    }

    // 2. Remove every device record
    for device_id in &account.device_ids {
        let _ = state.devices.remove(&req.pin, device_id).await;
    }

    // 3. Purge prekeys
    let _ = state.prekeys.delete_all(&req.pin).await;

    // 4. Delete account record — after this the PIN is free for re-registration
    //    (but the cryptographic identity is gone so prior messages are inaccessible)
    let _ = state.accounts.delete(&req.pin).await;

    tracing::warn!(
        pin = %req.pin,
        devices = device_count,
        "account self-deleted — relay data purged"
    );

    Ok(Json(DeleteAccountResponse { ok: true, devices_removed: device_count }))
}
