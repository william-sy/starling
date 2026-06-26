use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub nats_url: String,
    pub listen_addr: String,
    /// Seconds before an undelivered message blob is purged
    pub message_ttl_secs: u64,
    /// TTL for the relay-fallback device-link blob (short — pairing window)
    pub link_ttl_secs: u64,
    /// Max messages/day for free tier
    pub free_daily_limit: u32,
    /// Max messages/day for paid tiers
    pub paid_daily_limit: u32,
    /// When true, WS token and Bearer headers are trusted as PIN strings — no signature.
    /// Set DEV_NO_AUTH=true for local two-instance testing only.
    pub dev_no_auth: bool,
    /// Shared secret for TURN time-limited credentials (RFC 8489 / coturn use-auth-secret).
    /// Empty string disables the /turn-creds endpoint.
    pub turn_secret: String,
    /// Comma-separated TURN/STUN URLs returned to clients (e.g. "turn:example.com:3478").
    pub turn_urls: Vec<String>,
    /// Enable the bot HTTP API. Only activate on self-hosted colonies.
    pub bot_api_enabled: bool,
    /// Optional secret that callers must supply as Bearer token to POST /bot/register.
    /// Empty means no protection (fine for private/air-gapped networks).
    pub bot_admin_token: Option<String>,
    /// If set, new accounts must supply this passphrase in the /register body.
    /// Leave empty for open registration. Set via REGISTRATION_PASSPHRASE env var.
    pub registration_passphrase: Option<String>,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            nats_url: env::var("NATS_URL")
                .unwrap_or_else(|_| "nats://localhost:4222".into()),
            listen_addr: env::var("LISTEN_ADDR")
                .unwrap_or_else(|_| "0.0.0.0:3000".into()),
            dev_no_auth: env::var("DEV_NO_AUTH").map(|v| v == "true").unwrap_or(false),
            message_ttl_secs: env::var("MESSAGE_TTL_SECS")
                .ok().and_then(|v| v.parse().ok())
                .unwrap_or(60 * 60 * 24 * 30),
            link_ttl_secs: env::var("LINK_TTL_SECS")
                .ok().and_then(|v| v.parse().ok())
                .unwrap_or(600),
            free_daily_limit: env::var("FREE_DAILY_LIMIT")
                .ok().and_then(|v| v.parse().ok())
                .unwrap_or(100),
            paid_daily_limit: env::var("PAID_DAILY_LIMIT")
                .ok().and_then(|v| v.parse().ok())
                .unwrap_or(250),
            turn_secret: env::var("TURN_SECRET").unwrap_or_default(),
            turn_urls: env::var("TURN_URLS")
                .unwrap_or_default()
                .split(',')
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(String::from)
                .collect(),
            bot_api_enabled: env::var("BOT_API_ENABLED").map(|v| v == "true").unwrap_or(false),
            bot_admin_token: env::var("BOT_ADMIN_TOKEN").ok().filter(|s| !s.is_empty()),
            registration_passphrase: env::var("REGISTRATION_PASSPHRASE").ok().filter(|s| !s.is_empty()),
        }
    }
}
