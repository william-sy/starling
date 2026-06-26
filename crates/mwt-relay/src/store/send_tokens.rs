use anyhow::Result;
use async_nats::jetstream::{self, kv::Store as KvStore};
use crate::store::kv_open;

pub struct SendTokenStore {
    kv: KvStore,
}

impl SendTokenStore {
    pub async fn new(js: &jetstream::Context) -> Result<Self> {
        let kv = kv_open(js, jetstream::kv::Config {
            bucket: "mwt-send-tokens".to_string(),
            history: 1,
            ..Default::default()
        }).await?;
        Ok(Self { kv })
    }

    pub async fn put(&self, token: &str, pin: &str) -> Result<()> {
        self.kv.put(token, pin.as_bytes().to_vec().into()).await?;
        Ok(())
    }

    pub async fn get_pin(&self, token: &str) -> Result<Option<String>> {
        match self.kv.get(token).await? {
            Some(entry) => Ok(Some(String::from_utf8(entry.to_vec())?)),
            None        => Ok(None),
        }
    }
}
