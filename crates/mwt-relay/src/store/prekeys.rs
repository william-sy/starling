use anyhow::Result;
use async_nats::jetstream::{self, kv::Store as KvStore};
use serde::{Deserialize, Serialize};

/// One-time prekey as stored in the relay.
/// The relay never has the secret — only the public key.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredPreKey {
    pub id: u64,
    pub public_key: String, // hex-encoded X25519 public
}

/// Signed prekey bundle for an account device.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceBundle {
    pub device_id: String,
    /// X25519 signed prekey (public, hex)
    pub spk: String,
    /// Ed25519 signature of spk (hex)
    pub spk_sig: String,
    /// Remaining one-time prekeys
    pub one_time_keys: Vec<StoredPreKey>,
}

pub struct PreKeyStore {
    kv: KvStore,
}

impl PreKeyStore {
    pub async fn new(js: &jetstream::Context) -> Result<Self> {
        let kv = js
            .create_key_value(jetstream::kv::Config {
                bucket: "mwt-prekeys".into(),
                history: 1,
                ..Default::default()
            })
            .await?;
        Ok(Self { kv })
    }

    fn key(pin: &str, device_id: &str) -> String {
        format!("{pin}.{device_id}")
    }

    pub async fn put_bundle(&self, pin: &str, bundle: &DeviceBundle) -> Result<()> {
        let key = Self::key(pin, &bundle.device_id);
        let bytes = serde_json::to_vec(bundle)?;
        self.kv.put(&key, bytes.into()).await?;
        Ok(())
    }

    /// Fetch bundle and pop one OPK (if any remain).
    /// The caller gets the bundle; the relay removes the consumed OPK.
    pub async fn fetch_and_pop_opk(
        &self,
        pin: &str,
        device_id: &str,
    ) -> Result<Option<DeviceBundle>> {
        let key = Self::key(pin, device_id);
        let mut bundle: DeviceBundle = match self.kv.get(&key).await? {
            Some(b) => serde_json::from_slice(&b)?,
            None => return Ok(None),
        };

        // Pop the last OPK so it won't be used again
        if !bundle.one_time_keys.is_empty() {
            bundle.one_time_keys.pop();
            let bytes = serde_json::to_vec(&bundle)?;
            self.kv.put(&key, bytes.into()).await?;
        }

        Ok(Some(bundle))
    }

    /// Delete all prekey bundles for an account across all its devices.
    /// Called during account deletion — device IDs are needed to know which keys to purge.
    pub async fn delete_all(&self, pin: &str) -> Result<()> {
        let prefix = format!("{pin}.");
        let mut keys = self.kv.keys().await?;
        use futures::StreamExt;
        while let Some(key) = keys.next().await {
            if let Ok(k) = key {
                if k.starts_with(&prefix) || k == pin {
                    let _ = self.kv.delete(&k).await;
                }
            }
        }
        Ok(())
    }
}
