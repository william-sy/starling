use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use crate::{store::accounts::AccountRecord, store::devices::DeviceRecord, AppState, tier::Tier};

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub pin: String,
    pub device_id: String,
    /// Hex-encoded Ed25519 signing public key
    pub sign_key: String,
    /// Hex-encoded X25519 DH public key
    pub dh_key: String,
    /// Required when the colony has REGISTRATION_PASSPHRASE set
    pub passphrase: Option<String>,
}

#[derive(Serialize)]
pub struct RegisterResponse {
    pub ok:         bool,
    pub send_token: String,
}

pub async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> Result<Json<RegisterResponse>, StatusCode> {
    if !is_valid_pin(&req.pin) {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Passphrase gate - checked before the conflict check so we don't leak whether a PIN exists
    if let Some(required) = &state.config.registration_passphrase {
        let provided = req.passphrase.as_deref().unwrap_or("");
        if provided != required.as_str() {
            tracing::warn!(pin = %req.pin, "registration rejected: wrong passphrase");
            return Err(StatusCode::FORBIDDEN);
        }
    }

    if state.accounts.exists(&req.pin).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? {
        return Err(StatusCode::CONFLICT);
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let send_token = uuid::Uuid::new_v4().to_string();

    let account = AccountRecord {
        pin: req.pin.clone(),
        sign_key: req.sign_key.clone(),
        dh_key: req.dh_key.clone(),
        device_ids: vec![req.device_id.clone()],
        tier: Tier::Pigeon,
        daily_sent: 0,
        daily_reset_date: String::new(),
        send_token: send_token.clone(),
        is_bot: false,
    };
    state.accounts.put(&account).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    state.send_tokens.put(&send_token, &req.pin).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let device = DeviceRecord {
        device_id: req.device_id.clone(),
        account_pin: req.pin.clone(),
        sign_key: req.sign_key.clone(),
        added_at: now,
    };
    state.devices.put(&device).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    tracing::info!(pin = %req.pin, device = %req.device_id, "account registered");
    Ok(Json(RegisterResponse { ok: true, send_token }))
}

fn is_valid_pin(pin: &str) -> bool {
    let parts: Vec<&str> = pin.split('-').collect();
    if parts.len() != 4 { return false; }
    parts.iter().all(|p| {
        p.len() == 4 && p.chars().all(|c| {
            c.is_ascii_alphanumeric() && c != '0' && c != 'O' && c != '1' && c != 'I'
        })
    })
}
