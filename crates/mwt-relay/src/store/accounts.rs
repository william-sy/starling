use anyhow::Result;
use async_nats::jetstream::{self, kv::Store as KvStore};
use serde::{Deserialize, Serialize};
use crate::tier::Tier;

/// Account record stored in NATS KV — one entry per Account PIN.
/// Contains only what the relay needs for routing and enforcement.
/// No message content, no social graph readable by us.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountRecord {
    pub pin: String,
    /// Ed25519 signing public key (hex) — used to verify revocation commands
    pub sign_key: String,
    /// X25519 DH public key (hex) — used in X3DH bundle serving
    pub dh_key: String,
    /// Registered device IDs for this account
    pub device_ids: Vec<String>,
    pub tier: Tier,
    /// Messages sent today (reset at UTC midnight)
    pub daily_sent: u32,
    /// UTC date string of last reset — "2026-06-20"
    pub daily_reset_date: String,
    /// Opaque token returned at registration; used in Authorization header instead of PIN
    #[serde(default)]
    pub send_token: String,
    /// True for bot accounts registered via /bot/register (self-hosted only)
    #[serde(default)]
    pub is_bot: bool,
}

pub struct AccountStore {
    kv: KvStore,
}

impl AccountStore {
    pub async fn new(js: &jetstream::Context) -> Result<Self> {
        let kv = js
            .create_key_value(jetstream::kv::Config {
                bucket: "mwt-accounts".into(),
                history: 1,
                ..Default::default()
            })
            .await?;
        Ok(Self { kv })
    }

    pub async fn get(&self, pin: &str) -> Result<Option<AccountRecord>> {
        match self.kv.get(pin).await? {
            Some(entry) => Ok(Some(serde_json::from_slice(&entry)?)),
            None => Ok(None),
        }
    }

    pub async fn put(&self, record: &AccountRecord) -> Result<()> {
        let bytes = serde_json::to_vec(record)?;
        self.kv.put(&record.pin, bytes.into()).await?;
        Ok(())
    }

    pub async fn exists(&self, pin: &str) -> Result<bool> {
        Ok(self.kv.get(pin).await?.is_some())
    }

    pub async fn delete(&self, pin: &str) -> Result<()> {
        self.kv.delete(pin).await?;
        Ok(())
    }

    /// Atomically increment daily send counter and check against limit.
    /// Returns true if the send is allowed, false if rate-limited.
    pub async fn check_and_increment_daily(&self, pin: &str, limit: u32) -> Result<bool> {
        let today = today_str();
        let mut record = match self.get(pin).await? {
            Some(r) => r,
            None => return Ok(false),
        };

        if record.daily_reset_date != today {
            record.daily_sent = 0;
            record.daily_reset_date = today;
        }

        if record.daily_sent >= limit {
            return Ok(false);
        }

        record.daily_sent += 1;
        self.put(&record).await?;
        Ok(true)
    }
}

fn today_str() -> String {
    // UTC date — simple approach without pulling in chrono
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let days = secs / 86400;
    // Julian day → Gregorian (Zeller's congruence variant)
    let z = days as i64 + 2440588; // Unix epoch is Julian day 2440588
    let a = z + 32044;
    let b = (4 * a + 3) / 146097;
    let c = a - (146097 * b) / 4;
    let d = (4 * c + 3) / 1461;
    let e = c - (1461 * d) / 4;
    let m = (5 * e + 2) / 153;
    let day   = e - (153 * m + 2) / 5 + 1;
    let month = m + 3 - 12 * (m / 10);
    let year  = 100 * b + d - 4800 + m / 10;
    format!("{year:04}-{month:02}-{day:02}")
}
