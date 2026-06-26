use axum::{extract::State, http::StatusCode, Json};
use base64::{engine::general_purpose::STANDARD, Engine};
use hmac::{Hmac, Mac};
use serde::Serialize;
use sha1::Sha1;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::AppState;

#[derive(Serialize)]
pub struct TurnCreds {
    pub username:   String,
    pub credential: String,
    pub urls:       Vec<String>,
    pub ttl:        u64,
}

// Credentials valid for 24 hours; coturn checks expiry from the username timestamp.
const TTL_SECS: u64 = 86_400;

pub async fn get_turn_creds(
    State(state): State<AppState>,
) -> Result<Json<TurnCreds>, StatusCode> {
    if state.config.turn_secret.is_empty() {
        return Err(StatusCode::NOT_FOUND);
    }

    let expiry = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() + TTL_SECS)
        .unwrap_or(0);

    let username = format!("{expiry}:starling");

    let mut mac = Hmac::<Sha1>::new_from_slice(state.config.turn_secret.as_bytes())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    mac.update(username.as_bytes());
    let credential = STANDARD.encode(mac.finalize().into_bytes());

    Ok(Json(TurnCreds {
        username,
        credential,
        urls: state.config.turn_urls.clone(),
        ttl: TTL_SECS,
    }))
}
