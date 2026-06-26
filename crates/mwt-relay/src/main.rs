use anyhow::Result;
use axum::{
    routing::{delete, get, post, put},
    Router,
};

use std::sync::Arc;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

mod auth;
mod config;
mod tier;
mod store;
mod routes;

use auth::AuthStore;
use config::Config;
use store::{AccountStore, ChannelStore, DeviceStore, PreKeyStore, SendTokenStore};

#[derive(Clone)]
pub struct AppState {
    pub nats:        async_nats::Client,
    pub js:          async_nats::jetstream::Context,
    pub accounts:    Arc<AccountStore>,
    pub prekeys:     Arc<PreKeyStore>,
    pub devices:     Arc<DeviceStore>,
    pub channels:    Arc<ChannelStore>,
    pub auth:        Arc<AuthStore>,
    pub send_tokens: Arc<SendTokenStore>,
    pub config:      Arc<Config>,
    pub og_cache:    routes::og::OgCache,
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Arc::new(Config::from_env());
    tracing::info!(nats = %config.nats_url, addr = %config.listen_addr, "starting mwt-relay");

    let nats = async_nats::connect(&config.nats_url).await?;
    let js   = async_nats::jetstream::new(nats.clone());

    ensure_streams(&js, &config).await?;

    let state = AppState {
        nats:        nats.clone(),
        js:          js.clone(),
        accounts:    Arc::new(AccountStore::new(&js).await?),
        prekeys:     Arc::new(PreKeyStore::new(&js).await?),
        devices:     Arc::new(DeviceStore::new(&js).await?),
        channels:    Arc::new(ChannelStore::new(&js).await?),
        auth:        Arc::new(AuthStore::new(&js).await?),
        send_tokens: Arc::new(SendTokenStore::new(&js).await?),
        config:      config.clone(),
        og_cache:    routes::og::new_cache(),
    };

    let app = Router::new()
        // Auth
        .route("/auth/challenge",       post(routes::auth::request_challenge))
        .route("/auth/verify",          post(routes::auth::verify_challenge))
        .route("/auth/logout",          post(routes::auth::logout))
        // Account lifecycle
        .route("/register",             post(routes::register::register))
        // Device management
        .route("/devices/add",          post(routes::devices::add_device))
        .route("/devices/revoke",       post(routes::devices::revoke_device))
        // Account — public info check + self-deletion
        .route("/account/:pin",         get(routes::account::get_account_info))
        .route("/account",              delete(routes::account::delete_account))
        // Contact add requests
        .route("/add-request",          post(routes::add_request::send_add_request))
        // Message delivery
        .route("/message",              post(routes::messages::send_message))
        .route("/connect",              get(routes::messages::ws_connect))
        .route("/ws",                   get(routes::messages::ws_connect)) // alias
        .route("/turn-creds",           get(routes::turn_creds::get_turn_creds))
        // Prekey bundles
        .route("/prekeys/:pin/:device", get(routes::prekeys::get_prekeys).put(routes::prekeys::put_prekeys))
        // Identity key lookup (for X3DH initiation)
        .route("/identity/:pin",        get(routes::identity::get_identity))
        // Bot API (self-hosted only - requires BOT_API_ENABLED=true)
        .route("/bot/register",  post(routes::bot::register_bot))
        .route("/bot/messages",  get(routes::bot::poll_messages))
        // OG preview proxy - fetches server-side to avoid CORS and hide client IP
        .route("/api/og",        get(routes::og::get_og))
        // Colony metadata - public, no auth required
        .route("/info",          get(routes::info::get_info))
        // Business channels
        .route("/channels",                                 post(routes::channels::create_channel))
        .route("/channels/:id/follow",                      post(routes::channels::follow_channel))
        .route("/channels/:id/unfollow",                    post(routes::channels::unfollow_channel))
        .route("/channels/:id/broadcast",                   post(routes::channels::broadcast))
        .route("/channels/:id/opened",                      post(routes::channels::record_opened))
        .route("/channels/:id/analytics/:bid",              get(routes::channels::get_analytics))
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&config.listen_addr).await?;
    tracing::info!("relay listening on {}", config.listen_addr);
    axum::serve(listener, app).await?;

    Ok(())
}

async fn ensure_streams(js: &async_nats::jetstream::Context, config: &Config) -> Result<()> {
    // Per-account inbox — messages purged after TTL; all devices for a PIN subscribe here
    js.get_or_create_stream(async_nats::jetstream::stream::Config {
        name: "mwt-inbox".into(),
        subjects: vec!["mwt.inbox.>".into()],
        max_age: std::time::Duration::from_secs(config.message_ttl_secs),
        storage: async_nats::jetstream::stream::StorageType::File,
        ..Default::default()
    })
    .await?;

    // Add-request stream
    js.get_or_create_stream(async_nats::jetstream::stream::Config {
        name: "mwt-addrequests".into(),
        subjects: vec!["mwt.addrequests.>".into()],
        max_age: std::time::Duration::from_secs(60 * 60 * 24 * 7),
        storage: async_nats::jetstream::stream::StorageType::File,
        ..Default::default()
    })
    .await?;

    // Device-link fallback — short TTL, memory only (no persistence needed)
    js.get_or_create_stream(async_nats::jetstream::stream::Config {
        name: "mwt-devicelink".into(),
        subjects: vec!["mwt.devicelink.>".into()],
        max_age: std::time::Duration::from_secs(config.link_ttl_secs),
        storage: async_nats::jetstream::stream::StorageType::Memory,
        ..Default::default()
    })
    .await?;

    // Device revocation events — short-lived, memory only
    js.get_or_create_stream(async_nats::jetstream::stream::Config {
        name: "mwt-revoke".into(),
        subjects: vec!["mwt.revoke.>".into()],
        max_age: std::time::Duration::from_secs(config.message_ttl_secs),
        storage: async_nats::jetstream::stream::StorageType::Memory,
        ..Default::default()
    })
    .await?;

    Ok(())
}
