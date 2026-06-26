use axum::{
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use crate::{store::accounts::AccountRecord, AppState, tier::Tier};

fn is_valid_pin(pin: &str) -> bool {
    let parts: Vec<&str> = pin.split('-').collect();
    if parts.len() != 4 { return false; }
    parts.iter().all(|p| {
        p.len() == 4 && p.chars().all(|c| {
            c.is_ascii_alphanumeric() && c != '0' && c != 'O' && c != '1' && c != 'I'
        })
    })
}

fn sanitize_consumer_name(pin: &str) -> String {
    pin.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '_' })
        .collect()
}

// -- Register ---------------------------------------------------------------

#[derive(Deserialize)]
pub struct RegisterBotRequest {
    pub pin: String,
    #[serde(default = "default_device")]
    pub device_id: String,
}
fn default_device() -> String { "bot-main".into() }

#[derive(Serialize)]
pub struct RegisterBotResponse {
    pub ok:         bool,
    pub pin:        String,
    pub send_token: String,
}

/// POST /bot/register
///
/// Registers a bot account. Only available when BOT_API_ENABLED=true.
/// If BOT_ADMIN_TOKEN is set, the caller must supply it as Bearer token.
/// Bots skip the E2E key ceremony (sign_key and dh_key are left empty).
/// They receive the Condor tier so message rate limits do not apply.
pub async fn register_bot(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<RegisterBotRequest>,
) -> Result<Json<RegisterBotResponse>, StatusCode> {
    if !state.config.bot_api_enabled {
        return Err(StatusCode::NOT_FOUND);
    }

    if let Some(expected) = &state.config.bot_admin_token {
        let provided = headers
            .get("Authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .map(str::trim)
            .unwrap_or("");
        if provided != expected.as_str() {
            return Err(StatusCode::UNAUTHORIZED);
        }
    }

    if !is_valid_pin(&req.pin) {
        return Err(StatusCode::BAD_REQUEST);
    }

    if state.accounts.exists(&req.pin).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? {
        return Err(StatusCode::CONFLICT);
    }

    let send_token = uuid::Uuid::new_v4().to_string();

    let account = AccountRecord {
        pin:              req.pin.clone(),
        sign_key:         String::new(),
        dh_key:           String::new(),
        device_ids:       vec![req.device_id.clone()],
        tier:             Tier::Condor,
        daily_sent:       0,
        daily_reset_date: String::new(),
        send_token:       send_token.clone(),
        is_bot:           true,
    };

    state.accounts.put(&account).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    state.send_tokens.put(&send_token, &req.pin).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    tracing::info!(pin = %req.pin, "bot registered");
    Ok(Json(RegisterBotResponse { ok: true, pin: req.pin, send_token }))
}

// -- Poll -------------------------------------------------------------------

#[derive(Deserialize)]
pub struct PollQuery {
    /// JetStream sequence to start from (exclusive). Omit to receive only new messages.
    pub since:   Option<u64>,
    /// Max messages to return per request (1-200, default 50).
    pub limit:   Option<usize>,
    /// Seconds to wait for at least one message before returning empty.
    /// Capped at 30. Default 20 (long-poll).
    pub timeout: Option<u64>,
}

#[derive(Serialize)]
pub struct BotMessage {
    /// JetStream stream sequence number. Pass as `since` on the next call.
    pub seq:     u64,
    /// Base64-encoded raw payload as stored in the relay inbox.
    /// Human-to-bot: E2E ciphertext. Bot-to-bot: operator-defined format.
    pub payload: String,
    /// Unix timestamp (seconds) when the message was published to the relay.
    pub ts:      i64,
}

#[derive(Serialize)]
pub struct PollResponse {
    pub messages: Vec<BotMessage>,
    /// Highest sequence seen in this batch. Pass as `since` on the next call.
    pub last_seq: Option<u64>,
}

/// GET /bot/messages?since=<seq>&limit=<n>&timeout=<secs>
///
/// HTTP long-poll endpoint for bot accounts. Blocks until at least one message
/// arrives or the timeout expires. Uses a durable pull consumer so messages
/// are never lost between poll calls even if the bot restarts.
pub async fn poll_messages(
    State(state): State<AppState>,
    Query(params): Query<PollQuery>,
    headers: HeaderMap,
) -> Result<Json<PollResponse>, StatusCode> {
    if !state.config.bot_api_enabled {
        return Err(StatusCode::NOT_FOUND);
    }

    let bot_pin = resolve_bot(&headers, &state).await
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let limit   = params.limit.unwrap_or(50).clamp(1, 200);
    let timeout = std::time::Duration::from_secs(params.timeout.unwrap_or(20).min(30));

    let stream = state.js.get_stream("mwt-inbox").await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let consumer_name = format!("bot-{}", sanitize_consumer_name(&bot_pin));

    let deliver_policy = match params.since {
        Some(seq) if seq > 0 => async_nats::jetstream::consumer::DeliverPolicy::ByStartSequence {
            start_sequence: seq + 1,
        },
        _ => async_nats::jetstream::consumer::DeliverPolicy::New,
    };

    let cfg = async_nats::jetstream::consumer::pull::Config {
        durable_name:   Some(consumer_name.clone()),
        filter_subject: format!("mwt.inbox.{}", bot_pin),
        ack_policy:     async_nats::jetstream::consumer::AckPolicy::Explicit,
        deliver_policy,
        ..Default::default()
    };

    let consumer = stream.get_or_create_consumer(&consumer_name, cfg).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let deadline  = tokio::time::Instant::now() + timeout;
    let mut messages: Vec<BotMessage> = Vec::with_capacity(limit);
    let mut last_seq = None;

    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() { break; }

        let want  = (limit - messages.len()).max(1);
        let batch = consumer.fetch().max_messages(want).messages().await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let before = messages.len();
        tokio::pin!(batch);

        loop {
            match tokio::time::timeout_at(deadline, batch.next()).await {
                Ok(Some(Ok(msg))) => {
                    let (seq, ts) = msg.info().ok()
                        .map(|i| (i.stream_sequence, i.published.unix_timestamp()))
                        .unwrap_or((0, 0));
                    let _ = msg.ack().await;
                    last_seq = Some(seq);
                    messages.push(BotMessage { seq, payload: B64.encode(&msg.payload), ts });
                    if messages.len() >= limit { break; }
                }
                _ => break,
            }
        }

        if messages.len() > before { break; }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }

    Ok(Json(PollResponse { messages, last_seq }))
}

// -- Auth helper ------------------------------------------------------------

async fn resolve_bot(headers: &HeaderMap, state: &AppState) -> Option<String> {
    let token = headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|s| s.trim().to_owned())?;

    let pin     = state.send_tokens.get_pin(&token).await.ok().flatten()?;
    let account = state.accounts.get(&pin).await.ok().flatten()?;
    if account.is_bot { Some(pin) } else { None }
}
