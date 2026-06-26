use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::{Deserialize, Serialize};
use crate::{store::prekeys::DeviceBundle, AppState};

#[derive(Serialize)]
pub struct PreKeyResponse {
    pub bundle: DeviceBundle,
}

#[derive(Deserialize)]
pub struct UploadBundleRequest {
    pub bundle: DeviceBundle,
}

/// PUT /prekeys/:pin/:device
///
/// Upload or replace a prekey bundle (SPK + one-time prekeys) for a device.
/// Authenticated in DEV_NO_AUTH mode by Bearer == PIN.
pub async fn put_prekeys(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((pin, _device_id)): Path<(String, String)>,
    Json(req): Json<UploadBundleRequest>,
) -> Result<StatusCode, StatusCode> {
    if state.config.dev_no_auth {
        let bearer = headers
            .get("Authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .map(|s| s.trim())
            .ok_or(StatusCode::UNAUTHORIZED)?;
        if bearer != pin { return Err(StatusCode::UNAUTHORIZED); }
    }
    state.prekeys.put_bundle(&pin, &req.bundle).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(StatusCode::NO_CONTENT)
}

/// GET /prekeys/:pin/:device
///
/// Fetch a prekey bundle for a given account + device.
/// Pops one one-time prekey — it will not be served again.
/// The relay only serves public key material here — no secrets ever stored.
pub async fn get_prekeys(
    State(state): State<AppState>,
    Path((pin, device_id)): Path<(String, String)>,
) -> Result<Json<PreKeyResponse>, StatusCode> {
    let bundle = state
        .prekeys
        .fetch_and_pop_opk(&pin, &device_id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(PreKeyResponse { bundle }))
}
