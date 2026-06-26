use ed25519_dalek::Signer;
use zeroize::ZeroizeOnDrop;
use serde::{Deserialize, Serialize};

use crate::{keys::{IdentityKey, PublishedIdentity}, recovery::RecoveryPhrase, pin::AccountPin, CryptoError};

/// Full local identity — created once at signup, stored encrypted by the user's password.
#[derive(ZeroizeOnDrop)]
pub struct LocalIdentity {
    pub pin: AccountPin,
    identity_key: IdentityKey,
    recovery_phrase: RecoveryPhrase,
}

impl LocalIdentity {
    pub fn generate() -> Result<Self, CryptoError> {
        let pin = AccountPin::generate()?;
        let identity_key = IdentityKey::generate();
        let recovery_phrase = RecoveryPhrase::generate()?;
        Ok(Self { pin, identity_key, recovery_phrase })
    }

    /// What gets uploaded to the relay so contacts can find and verify us.
    pub fn published(&self) -> PublishedIdentity {
        PublishedIdentity {
            sign_key: self.identity_key.sign_public_key().to_bytes(),
            dh_key: self.identity_key.dh_public.to_bytes(),
        }
    }

    /// Sign a payload with our Ed25519 identity key.
    /// Used for: signing SPKs, signing device revocation commands.
    pub fn sign(&self, msg: &[u8]) -> Vec<u8> {
        self.identity_key.signing_key().sign(msg).to_bytes().to_vec()
    }

    pub fn identity_key(&self) -> &IdentityKey {
        &self.identity_key
    }

    /// Recovery phrase words — shown once at signup.
    pub fn recovery_words(&self) -> Vec<String> {
        self.recovery_phrase.words()
    }
}
