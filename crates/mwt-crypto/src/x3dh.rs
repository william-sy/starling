use ed25519_dalek::{Signer, Verifier, VerifyingKey, Signature};
use hkdf::Hkdf;
use sha2::Sha256;
use x25519_dalek::{PublicKey as XPub, StaticSecret};
use zeroize::Zeroize;
use serde::{Deserialize, Serialize};

use crate::{keys::{DhKeypair, IdentityKey}, CryptoError};

const X3DH_INFO: &[u8] = b"mwt-v1-x3dh";

// Leading 0xFF padding — matches Signal spec §3.3 to domain-separate X3DH output
const X3DH_F: [u8; 32] = [0xFF; 32];

/// What Bob uploads to the relay per device so Alice can start a session offline.
#[derive(Serialize, Deserialize, Clone)]
pub struct PreKeyBundle {
    /// Bob's X25519 identity public key (for DH1/DH2 in X3DH)
    pub ik_dh: [u8; 32],
    /// Bob's Ed25519 signing public key (for verifying spk_sig)
    pub ik_sign: [u8; 32],
    /// Bob's signed prekey (X25519)
    pub spk: [u8; 32],
    /// Ed25519 signature of spk under ik_sign
    pub spk_sig: Vec<u8>,
    /// One-time prekey (X25519); relay pops one per session init, None when exhausted
    pub opk: Option<[u8; 32]>,
    pub opk_id: Option<u32>,
}

/// What Alice includes with her first ratchet message so Bob can reconstruct the shared secret.
#[derive(Serialize, Deserialize, Clone)]
pub struct InitialMessage {
    /// Alice's X25519 identity public key
    pub ik_dh_a: [u8; 32],
    /// Alice's ephemeral X25519 key
    pub ek_a: [u8; 32],
    /// Which of Bob's OPKs was consumed (so Bob deletes it)
    pub opk_id: Option<u32>,
}

/// Sender (Alice): compute shared secret from Bob's prekey bundle.
///
/// Returns `(shared_secret_32, initial_message)`.
/// Alice then calls `RatchetSession::init_sender(shared_secret, bundle.spk)`.
pub fn x3dh_send(
    alice_ik: &IdentityKey,
    bundle: &PreKeyBundle,
) -> Result<([u8; 32], InitialMessage), CryptoError> {
    // Verify Bob signed his SPK with his Ed25519 signing key
    let bob_sign_vk = VerifyingKey::from_bytes(&bundle.ik_sign)
        .map_err(|_| CryptoError::InvalidKey)?;
    let sig_arr: [u8; 64] = bundle.spk_sig.as_slice()
        .try_into()
        .map_err(|_| CryptoError::InvalidKey)?;
    let sig = Signature::from_bytes(&sig_arr);
    bob_sign_vk.verify(&bundle.spk, &sig)
        .map_err(|_| CryptoError::SignatureInvalid)?;

    let ek = DhKeypair::generate();
    let bob_ik_dh = XPub::from(bundle.ik_dh);
    let bob_spk   = XPub::from(bundle.spk);

    // DH1 = DH(IK_A, SPK_B)  — Alice's identity × Bob's mid-term key (mutual auth)
    // DH2 = DH(EK_A, IK_B)   — Alice's ephemeral × Bob's identity (forward secrecy)
    // DH3 = DH(EK_A, SPK_B)  — Alice's ephemeral × Bob's mid-term (forward secrecy)
    // DH4 = DH(EK_A, OPK_B)  — one-time prekey (deniability, optional)
    let dh1 = alice_ik.dh_secret().diffie_hellman(&bob_spk).to_bytes();
    let dh2 = ek.diffie_hellman(&bob_ik_dh);
    let dh3 = ek.diffie_hellman(&bob_spk);

    let mut ikm: Vec<u8> = Vec::with_capacity(32 * 5);
    ikm.extend_from_slice(&X3DH_F);
    ikm.extend_from_slice(&dh1);
    ikm.extend_from_slice(&dh2);
    ikm.extend_from_slice(&dh3);

    let opk_id = if let (Some(opk_bytes), Some(id)) = (bundle.opk, bundle.opk_id) {
        let dh4 = ek.diffie_hellman(&XPub::from(opk_bytes));
        ikm.extend_from_slice(&dh4);
        Some(id)
    } else {
        None
    };

    let sk = hkdf_sk(&ikm)?;
    ikm.zeroize();

    let init = InitialMessage {
        ik_dh_a: alice_ik.dh_public.to_bytes(),
        ek_a: ek.public.to_bytes(),
        opk_id,
    };

    Ok((sk, init))
}

/// Receiver (Bob): recompute shared secret from Alice's InitialMessage.
///
/// `bob_spk` must be the keypair whose public key is in the bundle.
/// `bob_opk` must be the one-time prekey matching `init.opk_id`, if any.
pub fn x3dh_receive(
    bob_ik: &IdentityKey,
    bob_spk: &DhKeypair,
    bob_opk: Option<&DhKeypair>,
    init: &InitialMessage,
) -> Result<[u8; 32], CryptoError> {
    let alice_ik_dh = XPub::from(init.ik_dh_a);
    let alice_ek    = XPub::from(init.ek_a);

    let dh1 = bob_spk.diffie_hellman(&alice_ik_dh);
    let dh2 = bob_ik.dh_secret().diffie_hellman(&alice_ek).to_bytes();
    let dh3 = bob_spk.diffie_hellman(&alice_ek);

    let mut ikm: Vec<u8> = Vec::with_capacity(32 * 5);
    ikm.extend_from_slice(&X3DH_F);
    ikm.extend_from_slice(&dh1);
    ikm.extend_from_slice(&dh2);
    ikm.extend_from_slice(&dh3);

    if let Some(opk) = bob_opk {
        let dh4 = opk.diffie_hellman(&alice_ek);
        ikm.extend_from_slice(&dh4);
    }

    let sk = hkdf_sk(&ikm)?;
    ikm.zeroize();
    Ok(sk)
}

fn hkdf_sk(ikm: &[u8]) -> Result<[u8; 32], CryptoError> {
    let hk = Hkdf::<Sha256>::new(None, ikm);
    let mut sk = [0u8; 32];
    hk.expand(X3DH_INFO, &mut sk).map_err(|_| CryptoError::Kdf)?;
    Ok(sk)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keys::IdentityKey;
    use ed25519_dalek::Signer;

    #[test]
    fn x3dh_shared_secret_matches() {
        let alice_ik = IdentityKey::generate();
        let bob_ik   = IdentityKey::generate();
        let bob_spk  = DhKeypair::generate();

        let spk_sig = bob_ik.signing_key().sign(&bob_spk.public.to_bytes());

        let bundle = PreKeyBundle {
            ik_dh:  bob_ik.dh_public.to_bytes(),
            ik_sign: bob_ik.sign_public_key().to_bytes(),
            spk:    bob_spk.public.to_bytes(),
            spk_sig: spk_sig.to_vec(),
            opk: None,
            opk_id: None,
        };

        let (alice_sk, init) = x3dh_send(&alice_ik, &bundle).unwrap();
        let bob_sk = x3dh_receive(&bob_ik, &bob_spk, None, &init).unwrap();

        assert_eq!(alice_sk, bob_sk, "shared secrets must match");
    }

    #[test]
    fn x3dh_with_one_time_prekey() {
        let alice_ik = IdentityKey::generate();
        let bob_ik   = IdentityKey::generate();
        let bob_spk  = DhKeypair::generate();
        let bob_opk  = DhKeypair::generate();

        let spk_sig = bob_ik.signing_key().sign(&bob_spk.public.to_bytes());

        let bundle = PreKeyBundle {
            ik_dh:   bob_ik.dh_public.to_bytes(),
            ik_sign: bob_ik.sign_public_key().to_bytes(),
            spk:     bob_spk.public.to_bytes(),
            spk_sig: spk_sig.to_vec(),
            opk: Some(bob_opk.public.to_bytes()),
            opk_id: Some(1),
        };

        let (alice_sk, init) = x3dh_send(&alice_ik, &bundle).unwrap();
        let bob_sk = x3dh_receive(&bob_ik, &bob_spk, Some(&bob_opk), &init).unwrap();

        assert_eq!(alice_sk, bob_sk);
    }
}
