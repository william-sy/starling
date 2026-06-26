pub mod accounts;
pub mod prekeys;
pub mod devices;
pub mod channels;
pub mod send_tokens;

pub use accounts::AccountStore;
pub use prekeys::PreKeyStore;
pub use devices::DeviceStore;
pub use channels::ChannelStore;
pub use send_tokens::SendTokenStore;

/// Create a KV bucket, or open it if it already exists.
/// async-nats 0.35 has no built-in "get_or_create"; this fills that gap.
pub async fn kv_open(
    js: &async_nats::jetstream::Context,
    config: async_nats::jetstream::kv::Config,
) -> anyhow::Result<async_nats::jetstream::kv::Store> {
    let bucket = config.bucket.clone();
    match js.create_key_value(config).await {
        Ok(store) => Ok(store),
        Err(_)    => js.get_key_value(&bucket).await.map_err(|e| anyhow::anyhow!(e)),
    }
}
