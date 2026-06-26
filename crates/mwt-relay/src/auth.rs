use anyhow::Result;
use async_nats::jetstream::{self, kv::Store as KvStore};
use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{request::Parts, StatusCode},
};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

/// Active session stored in NATS KV with TTL.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub pin: String,
    pub device_id: String,
    /// Unix timestamp of expiry
    pub expires_at: u64,
}

/// Pending challenge stored until the client signs and returns it.
#[derive(Debug, Serialize, Deserialize)]
pub struct Challenge {
    pub nonce: String, // hex-encoded 32 random bytes
    pub expires_at: u64,
}

pub struct AuthStore {
    sessions: KvStore,
    challenges: KvStore,
}

impl AuthStore {
    pub async fn new(js: &jetstream::Context) -> Result<Self> {
        let sessions = js
            .create_key_value(jetstream::kv::Config {
                bucket: "mwt-sessions".into(),
                max_age: std::time::Duration::from_secs(60 * 60 * 24 * 30),
                history: 1,
                ..Default::default()
            })
            .await?;

        let challenges = js
            .create_key_value(jetstream::kv::Config {
                bucket: "mwt-challenges".into(),
                max_age: std::time::Duration::from_secs(120),
                history: 1,
                ..Default::default()
            })
            .await?;

        Ok(Self { sessions, challenges })
    }

    /// Issue a challenge nonce for a device to sign.
    pub async fn issue_challenge(&self, pin: &str, device_id: &str) -> Result<String> {
        let mut nonce_bytes = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = hex::encode(nonce_bytes);

        let challenge = Challenge {
            nonce: nonce.clone(),
            expires_at: now_secs() + 120,
        };

        let key = format!("{pin}.{device_id}");
        self.challenges.put(&key, serde_json::to_vec(&challenge)?.into()).await?;
        Ok(nonce)
    }

    /// Consume challenge and return it (one-time use).
    pub async fn take_challenge(&self, pin: &str, device_id: &str) -> Result<Option<Challenge>> {
        let key = format!("{pin}.{device_id}");
        let result = match self.challenges.get(&key).await? {
            Some(b) => Some(serde_json::from_slice(&b)?),
            None => None,
        };
        // Delete regardless so it can't be replayed
        let _ = self.challenges.delete(&key).await;
        Ok(result)
    }

    /// Create a session token after successful signature verification.
    pub async fn create_session(&self, pin: &str, device_id: &str) -> Result<String> {
        let mut token_bytes = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut token_bytes);
        let token = hex::encode(token_bytes);

        let session = Session {
            pin: pin.to_owned(),
            device_id: device_id.to_owned(),
            expires_at: now_secs() + 60 * 60 * 24 * 30,
        };

        self.sessions.put(&token, serde_json::to_vec(&session)?.into()).await?;
        Ok(token)
    }

    pub async fn get_session(&self, token: &str) -> Result<Option<Session>> {
        match self.sessions.get(token).await? {
            Some(b) => {
                let s: Session = serde_json::from_slice(&b)?;
                if s.expires_at < now_secs() {
                    let _ = self.sessions.delete(token).await;
                    Ok(None)
                } else {
                    Ok(Some(s))
                }
            }
            None => Ok(None),
        }
    }

    pub async fn revoke_session(&self, token: &str) -> Result<()> {
        let _ = self.sessions.delete(token).await;
        Ok(())
    }
}

/// Axum extractor — resolves Bearer token from Authorization header into a Session.
pub struct AuthSession(pub Session);

#[async_trait]
impl<S> FromRequestParts<S> for AuthSession
where
    S: Send + Sync + std::fmt::Debug,
    S: axum::extract::FromRef<S>,
{
    type Rejection = StatusCode;

    async fn from_request_parts(_parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        // Full implementation: extract Bearer from Authorization header,
        // look up in AuthStore (via state), return Session.
        // Placeholder until AppState wiring is complete.
        Err(StatusCode::UNAUTHORIZED)
    }
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}
