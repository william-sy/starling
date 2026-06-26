use ed25519_dalek::{SigningKey, VerifyingKey};
use x25519_dalek::{PublicKey as X25519PublicKey, StaticSecret};
use zeroize::ZeroizeOnDrop;
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};

/// Long-term identity — holds both:
///   - Ed25519 keypair for signing (signing prekeys, device revocation commands)
///   - X25519 keypair for X3DH DH operations (IK_A / IK_B in the protocol)
/// Keeping them separate avoids Ed25519→X25519 scalar conversion edge cases.
#[derive(ZeroizeOnDrop)]
pub struct IdentityKey {
    signing: SigningKey,
    dh_secret: StaticSecret,
    #[zeroize(skip)]
    pub dh_public: X25519PublicKey,
}

impl IdentityKey {
    pub fn generate() -> Self {
        let signing = SigningKey::generate(&mut OsRng);
        let dh_secret = StaticSecret::random_from_rng(OsRng);
        let dh_public = X25519PublicKey::from(&dh_secret);
        Self { signing, dh_secret, dh_public }
    }

    pub fn sign_public_key(&self) -> VerifyingKey {
        self.signing.verifying_key()
    }

    pub fn signing_key(&self) -> &SigningKey {
        &self.signing
    }

    pub fn dh_secret(&self) -> &StaticSecret {
        &self.dh_secret
    }
}

/// What gets published to the relay for key lookup by Account PIN.
#[derive(Serialize, Deserialize, Clone)]
pub struct PublishedIdentity {
    /// Ed25519 public key — used to verify signed prekeys and revocation commands
    pub sign_key: [u8; 32],
    /// X25519 public key — used in X3DH (IK_B for receivers, IK_A for senders)
    pub dh_key: [u8; 32],
}

/// X25519 keypair used for the DH ratchet and prekeys.
#[derive(ZeroizeOnDrop)]
pub struct DhKeypair {
    secret: StaticSecret,
    pub public: X25519PublicKey,
}

impl DhKeypair {
    pub fn generate() -> Self {
        let secret = StaticSecret::random_from_rng(OsRng);
        let public = X25519PublicKey::from(&secret);
        Self { secret, public }
    }

    pub fn diffie_hellman(&self, their_public: &X25519PublicKey) -> [u8; 32] {
        self.secret.diffie_hellman(their_public).to_bytes()
    }
}
