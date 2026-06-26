use anyhow::Result;
use async_nats::jetstream::{self, kv::Store as KvStore};
use serde::{Deserialize, Serialize};

/// A business broadcast channel.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Channel {
    pub id: String,           // ulid
    pub owner_pin: String,
    pub name: String,
    pub follower_pins: Vec<String>,
    /// Total messages published
    pub total_published: u64,
    /// Aggregate delivery count across all messages
    pub total_delivered: u64,
    /// Aggregate open count
    pub total_opened: u64,
    /// Aggregate CTA link click count
    pub total_cta_clicks: u64,
}

/// Analytics snapshot for a single broadcast.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BroadcastAnalytics {
    pub channel_id: String,
    pub broadcast_id: String,
    pub follower_count: u64,
    pub delivered: u64,
    pub opened: u64,
    pub cta_clicks: u64,
}

pub struct ChannelStore {
    channels: KvStore,
    analytics: KvStore,
}

impl ChannelStore {
    pub async fn new(js: &jetstream::Context) -> Result<Self> {
        let channels = js
            .create_key_value(jetstream::kv::Config {
                bucket: "mwt-channels".into(),
                history: 1,
                ..Default::default()
            })
            .await?;

        let analytics = js
            .create_key_value(jetstream::kv::Config {
                bucket: "mwt-analytics".into(),
                history: 1,
                ..Default::default()
            })
            .await?;

        Ok(Self { channels, analytics })
    }

    pub async fn get(&self, id: &str) -> Result<Option<Channel>> {
        match self.channels.get(id).await? {
            Some(b) => Ok(Some(serde_json::from_slice(&b)?)),
            None => Ok(None),
        }
    }

    pub async fn put(&self, channel: &Channel) -> Result<()> {
        self.channels.put(&channel.id, serde_json::to_vec(channel)?.into()).await?;
        Ok(())
    }

    /// List channel IDs owned by a PIN (linear scan — fine at this scale).
    pub async fn list_for_owner(&self, pin: &str) -> Result<Vec<Channel>> {
        let mut out = Vec::new();
        let mut keys = self.channels.keys().await?;
        use futures::StreamExt;
        while let Some(key) = keys.next().await {
            let key = key?;
            if let Some(ch) = self.get(&key).await? {
                if ch.owner_pin == pin {
                    out.push(ch);
                }
            }
        }
        Ok(out)
    }

    pub async fn put_analytics(&self, a: &BroadcastAnalytics) -> Result<()> {
        let key = format!("{}.{}", a.channel_id, a.broadcast_id);
        self.analytics.put(&key, serde_json::to_vec(a)?.into()).await?;
        Ok(())
    }

    pub async fn get_analytics(
        &self,
        channel_id: &str,
        broadcast_id: &str,
    ) -> Result<Option<BroadcastAnalytics>> {
        let key = format!("{channel_id}.{broadcast_id}");
        match self.analytics.get(&key).await? {
            Some(b) => Ok(Some(serde_json::from_slice(&b)?)),
            None => Ok(None),
        }
    }

    /// Increment delivered count for a broadcast (called by relay on message ACK).
    pub async fn record_delivery(&self, channel_id: &str, broadcast_id: &str) -> Result<()> {
        let key = format!("{channel_id}.{broadcast_id}");
        if let Some(b) = self.analytics.get(&key).await? {
            let mut a: BroadcastAnalytics = serde_json::from_slice(&b)?;
            a.delivered += 1;
            self.analytics.put(&key, serde_json::to_vec(&a)?.into()).await?;
        }
        Ok(())
    }
}
