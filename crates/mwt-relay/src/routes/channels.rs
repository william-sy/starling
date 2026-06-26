use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use ulid::Ulid;
use crate::{store::channels::{BroadcastAnalytics, Channel}, AppState};

const MAX_CHANNELS_PER_BUSINESS: usize = 2;

#[derive(Deserialize)]
pub struct CreateChannelRequest {
    pub owner_pin: String,
    pub name: String,
    /// Session token — validated against owner_pin
    pub token: String,
}

#[derive(Serialize)]
pub struct CreateChannelResponse {
    pub channel_id: String,
}

pub async fn create_channel(
    State(state): State<AppState>,
    Json(req): Json<CreateChannelRequest>,
) -> Result<Json<CreateChannelResponse>, StatusCode> {
    // Verify session
    let session = state.auth.get_session(&req.token).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::UNAUTHORIZED)?;
    if session.pin != req.owner_pin {
        return Err(StatusCode::FORBIDDEN);
    }

    // Must be a Business tier account
    let account = state.accounts.get(&req.owner_pin).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;
    if !account.tier.is_business() {
        return Err(StatusCode::FORBIDDEN);
    }

    // Enforce max 2 channels per business
    let existing = state.channels.list_for_owner(&req.owner_pin).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if existing.len() >= MAX_CHANNELS_PER_BUSINESS {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    let channel = Channel {
        id: Ulid::new().to_string(),
        owner_pin: req.owner_pin,
        name: req.name,
        follower_pins: Vec::new(),
        total_published: 0,
        total_delivered: 0,
        total_opened: 0,
        total_cta_clicks: 0,
    };

    let id = channel.id.clone();
    state.channels.put(&channel).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    tracing::info!(channel_id = %id, "channel created");
    Ok(Json(CreateChannelResponse { channel_id: id }))
}

#[derive(Deserialize)]
pub struct FollowRequest {
    pub follower_pin: String,
    pub token: String,
}

pub async fn follow_channel(
    State(state): State<AppState>,
    Path(channel_id): Path<String>,
    Json(req): Json<FollowRequest>,
) -> Result<StatusCode, StatusCode> {
    let session = state.auth.get_session(&req.token).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::UNAUTHORIZED)?;
    if session.pin != req.follower_pin {
        return Err(StatusCode::FORBIDDEN);
    }

    let mut channel = state.channels.get(&channel_id).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    if !channel.follower_pins.contains(&req.follower_pin) {
        channel.follower_pins.push(req.follower_pin);
        state.channels.put(&channel).await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    Ok(StatusCode::OK)
}

pub async fn unfollow_channel(
    State(state): State<AppState>,
    Path(channel_id): Path<String>,
    Json(req): Json<FollowRequest>,
) -> Result<StatusCode, StatusCode> {
    let session = state.auth.get_session(&req.token).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::UNAUTHORIZED)?;
    if session.pin != req.follower_pin {
        return Err(StatusCode::FORBIDDEN);
    }

    let mut channel = state.channels.get(&channel_id).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    channel.follower_pins.retain(|p| p != &req.follower_pin);
    state.channels.put(&channel).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::OK)
}

#[derive(Deserialize)]
pub struct BroadcastRequest {
    pub owner_pin: String,
    pub token: String,
    /// Base64 ciphertext — encrypted per-follower-device by the client.
    /// The relay fans it out; it cannot read it.
    pub per_recipient: Vec<PerRecipient>,
    /// Optional CTA link (plain URL — the relay wraps it in a click counter)
    pub cta_url: Option<String>,
}

#[derive(Deserialize)]
pub struct PerRecipient {
    pub follower_pin: String,
    pub device_id: String,
    pub ciphertext: String, // base64
}

#[derive(Serialize)]
pub struct BroadcastResponse {
    pub broadcast_id: String,
    pub recipient_count: usize,
}

pub async fn broadcast(
    State(state): State<AppState>,
    Path(channel_id): Path<String>,
    Json(req): Json<BroadcastRequest>,
) -> Result<Json<BroadcastResponse>, StatusCode> {
    let session = state.auth.get_session(&req.token).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::UNAUTHORIZED)?;
    if session.pin != req.owner_pin {
        return Err(StatusCode::FORBIDDEN);
    }

    let mut channel = state.channels.get(&channel_id).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    if channel.owner_pin != req.owner_pin {
        return Err(StatusCode::FORBIDDEN);
    }

    let broadcast_id = Ulid::new().to_string();
    let recipient_count = req.per_recipient.len();

    // Fan out — publish each per-device ciphertext to the recipient's inbox
    for r in &req.per_recipient {
        let subject = format!("mwt.inbox.{}.{}", r.follower_pin, r.device_id);
        state.nats.publish(subject, r.ciphertext.clone().into()).await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    // Initialise analytics record
    let analytics = BroadcastAnalytics {
        channel_id: channel_id.clone(),
        broadcast_id: broadcast_id.clone(),
        follower_count: recipient_count as u64,
        delivered: 0,
        opened: 0,
        cta_clicks: 0,
    };
    state.channels.put_analytics(&analytics).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    channel.total_published += 1;
    state.channels.put(&channel).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    tracing::info!(
        channel = %channel_id,
        broadcast = %broadcast_id,
        recipients = recipient_count,
        "broadcast sent"
    );

    Ok(Json(BroadcastResponse { broadcast_id, recipient_count }))
}

/// Called by the client when a broadcast message is opened (read receipt — aggregate only).
/// No user identity is included — the relay just increments the counter.
#[derive(Deserialize)]
pub struct OpenedRequest {
    pub broadcast_id: String,
}

pub async fn record_opened(
    State(state): State<AppState>,
    Path(channel_id): Path<String>,
    Json(req): Json<OpenedRequest>,
) -> StatusCode {
    match state.channels.get_analytics(&channel_id, &req.broadcast_id).await {
        Ok(Some(mut a)) => {
            a.opened += 1;
            let _ = state.channels.put_analytics(&a).await;
            StatusCode::OK
        }
        _ => StatusCode::NOT_FOUND,
    }
}

/// Aggregate analytics — no individual tracking, just counts.
#[derive(Serialize)]
pub struct AnalyticsResponse {
    pub broadcast_id: String,
    pub follower_count: u64,
    pub delivered: u64,
    pub opened: u64,
    pub cta_clicks: u64,
    pub open_rate_pct: f32,
}

pub async fn get_analytics(
    State(state): State<AppState>,
    Path((channel_id, broadcast_id)): Path<(String, String)>,
) -> Result<Json<AnalyticsResponse>, StatusCode> {
    let a = state.channels
        .get_analytics(&channel_id, &broadcast_id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let open_rate_pct = if a.follower_count > 0 {
        (a.opened as f32 / a.follower_count as f32) * 100.0
    } else {
        0.0
    };

    Ok(Json(AnalyticsResponse {
        broadcast_id: a.broadcast_id,
        follower_count: a.follower_count,
        delivered: a.delivered,
        opened: a.opened,
        cta_clicks: a.cta_clicks,
        open_rate_pct,
    }))
}
