use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Tier {
    /// Free — 2 devices, 100 messages/day
    Pigeon,
    /// One-time purchase (2-person pack) — 3-4 devices, 250/day
    Tits,
    /// One-time purchase (family pack, up to 5) — 3-4 devices, 250/day
    FlockOfGeese,
    /// €2/month sustainability — screen share, unlimited groups, 250/day
    Sustainability,
    /// €10/month business — broadcast channels, analytics
    Business,
    /// Self-hosted bot account - no rate limit enforced
    Condor,
}

impl Tier {
    pub fn max_devices(self) -> u32 {
        match self {
            Tier::Pigeon => 2,
            Tier::Condor => 1,
            _ => 4,
        }
    }

    pub fn daily_message_limit(self) -> u32 {
        match self {
            Tier::Pigeon => 1_000,
            Tier::Condor => u32::MAX,
            _ => 5_000,
        }
    }

    pub fn can_send_gifs(self) -> bool {
        !matches!(self, Tier::Pigeon)
    }

    pub fn can_screen_share(self) -> bool {
        matches!(self, Tier::Sustainability | Tier::Business | Tier::Condor)
    }

    pub fn is_business(self) -> bool {
        matches!(self, Tier::Business)
    }
}
