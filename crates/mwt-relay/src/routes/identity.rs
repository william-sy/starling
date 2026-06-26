use axum::{extract::{Path, State}, http::StatusCode, Json};
use serde::Serialize;
use crate::AppState;

#[derive(Serialize)]
pub struct IdentityResponse {
    pub sign_key: String,
    pub dh_key:   String,
}

/// GET /identity/:pin
///
/// Returns the public identity keys for a registered PIN.
/// No auth required: these keys are public by design (shared to bootstrap X3DH).
pub async fn get_identity(
    State(state): State<AppState>,
    Path(pin): Path<String>,
) -> Result<Json<IdentityResponse>, StatusCode> {
    let record = state.accounts.get(&pin).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(IdentityResponse {
        sign_key: record.sign_key,
        dh_key:   record.dh_key,
    }))
}
