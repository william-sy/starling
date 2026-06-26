use anyhow::Result;
use async_nats::jetstream::{self, kv::Store as KvStore};
use serde::{Deserialize, Serialize};

/// Per-device record — stored separately from the account so we can revoke
/// individual devices without touching the whole account.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceRecord {
    pub device_id: String,
    pub account_pin: String,
    /// Ed25519 public key for challenge-response auth (hex)
    pub sign_key: String,
    pub added_at: u64,
}

pub struct DeviceStore {
    kv: KvStore,
}

impl DeviceStore {
    pub async fn new(js: &jetstream::Context) -> Result<Self> {
        let kv = js
            .create_key_value(jetstream::kv::Config {
                bucket: "mwt-devices".into(),
                history: 1,
                ..Default::default()
            })
            .await?;
        Ok(Self { kv })
    }

    fn key(pin: &str, device_id: &str) -> String {
        format!("{pin}.{device_id}")
    }

    pub async fn put(&self, device: &DeviceRecord) -> Result<()> {
        let key = Self::key(&device.account_pin, &device.device_id);
        self.kv.put(&key, serde_json::to_vec(device)?.into()).await?;
        Ok(())
    }

    pub async fn get(&self, pin: &str, device_id: &str) -> Result<Option<DeviceRecord>> {
        match self.kv.get(&Self::key(pin, device_id)).await? {
            Some(b) => Ok(Some(serde_json::from_slice(&b)?)),
            None => Ok(None),
        }
    }

    pub async fn remove(&self, pin: &str, device_id: &str) -> Result<()> {
        self.kv.delete(&Self::key(pin, device_id)).await?;
        Ok(())
    }
}
