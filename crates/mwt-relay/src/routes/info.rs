use axum::{extract::State, Json};
use serde::Serialize;
use crate::AppState;

#[derive(Serialize)]
pub struct ColonyInfo {
    pub version:              &'static str,
    pub requires_passphrase:  bool,
}

pub async fn get_info(State(state): State<AppState>) -> Json<ColonyInfo> {
    Json(ColonyInfo {
        version:             env!("CARGO_PKG_VERSION"),
        requires_passphrase: state.config.registration_passphrase.is_some(),
    })
}
