use chacha20poly1305::{
    aead::{Aead, KeyInit},
    XChaCha20Poly1305, XNonce,
};
use hkdf::Hkdf;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use zeroize::{Zeroize, ZeroizeOnDrop};
use crate::{keys::DhKeypair, CryptoError};
use x25519_dalek::PublicKey as X25519PublicKey;

type HmacSha256 = Hmac<Sha256>;

const MAX_SKIP: u32 = 1000;

/// Wire-format header for a ratchet message.
/// Serialised and used as AEAD associated data — tampering with the header
/// causes decryption to fail.
#[derive(Clone)]
pub struct MessageHeader {
    pub dh_public: [u8; 32],
    pub n: u32,
    pub prev_chain_len: u32,
}

impl MessageHeader {
    fn to_bytes(&self) -> [u8; 40] {
        let mut b = [0u8; 40];
        b[..32].copy_from_slice(&self.dh_public);
        b[32..36].copy_from_slice(&self.n.to_le_bytes());
        b[36..40].copy_from_slice(&self.prev_chain_len.to_le_bytes());
        b
    }
}

pub struct RatchetMessage {
    pub header: MessageHeader,
    pub ciphertext: Vec<u8>,
}

/// Double Ratchet session state (Signal protocol, §3).
#[derive(ZeroizeOnDrop)]
pub struct RatchetSession {
    dh_pair: DhKeypair,
    dh_remote: Option<[u8; 32]>,
    root_key: [u8; 32],
    send_chain_key: Option<[u8; 32]>,
    recv_chain_key: Option<[u8; 32]>,
    send_n: u32,
    recv_n: u32,
    prev_send_chain_len: u32,
    #[zeroize(skip)]
    skipped: std::collections::HashMap<([u8; 32], u32), [u8; 32]>,
}

impl RatchetSession {
    /// Alice initialises after completing X3DH with Bob's prekey bundle.
    pub fn init_sender(shared_secret: [u8; 32], their_dh_public: [u8; 32]) -> Self {
        let dh_pair = DhKeypair::generate();
        let (root_key, send_chain_key) = kdf_rk(&shared_secret, &dh_dh(&dh_pair, &their_dh_public));
        Self {
            dh_pair,
            dh_remote: Some(their_dh_public),
            root_key,
            send_chain_key: Some(send_chain_key),
            recv_chain_key: None,
            send_n: 0,
            recv_n: 0,
            prev_send_chain_len: 0,
            skipped: Default::default(),
        }
    }

    /// Bob initialises after receiving Alice's initial message.
    pub fn init_receiver(shared_secret: [u8; 32], our_dh_pair: DhKeypair) -> Self {
        Self {
            dh_pair: our_dh_pair,
            dh_remote: None,
            root_key: shared_secret,
            send_chain_key: None,
            recv_chain_key: None,
            send_n: 0,
            recv_n: 0,
            prev_send_chain_len: 0,
            skipped: Default::default(),
        }
    }

    pub fn encrypt(&mut self, plaintext: &[u8]) -> Result<RatchetMessage, CryptoError> {
        let chain_key = self.send_chain_key.ok_or(CryptoError::RatchetError)?;
        let (new_chain_key, msg_key) = kdf_ck(&chain_key);
        self.send_chain_key = Some(new_chain_key);

        let header = MessageHeader {
            dh_public: self.dh_pair.public.to_bytes(),
            n: self.send_n,
            prev_chain_len: self.prev_send_chain_len,
        };

        let ciphertext = aead_encrypt(&msg_key, header.n, plaintext, &header.to_bytes())?;
        self.send_n += 1;
        Ok(RatchetMessage { header, ciphertext })
    }

    pub fn decrypt(&mut self, msg: &RatchetMessage) -> Result<Vec<u8>, CryptoError> {
        let aad = msg.header.to_bytes();

        // Check if we already skipped past this message key
        if let Some(mk) = self.skipped.remove(&(msg.header.dh_public, msg.header.n)) {
            return aead_decrypt(&mk, msg.header.n, &msg.ciphertext, &aad);
        }

        // Ratchet step when: first message ever (dh_remote is None),
        // or sender has advanced their ratchet key.
        let needs_ratchet = self.dh_remote.map_or(true, |r| r != msg.header.dh_public);
        if needs_ratchet {
            self.skip_message_keys(msg.header.prev_chain_len)?;
            self.dh_ratchet(&msg.header)?;
        }

        self.skip_message_keys(msg.header.n)?;

        let chain_key = self.recv_chain_key.ok_or(CryptoError::RatchetError)?;
        let (new_chain_key, msg_key) = kdf_ck(&chain_key);
        self.recv_chain_key = Some(new_chain_key);
        self.recv_n += 1;

        aead_decrypt(&msg_key, msg.header.n, &msg.ciphertext, &aad)
    }

    fn dh_ratchet(&mut self, header: &MessageHeader) -> Result<(), CryptoError> {
        self.prev_send_chain_len = self.send_n;
        self.send_n = 0;
        self.recv_n = 0;
        self.dh_remote = Some(header.dh_public);

        let (rk, recv_ck) = kdf_rk(&self.root_key, &dh_dh(&self.dh_pair, &header.dh_public));
        self.root_key = rk;
        self.recv_chain_key = Some(recv_ck);

        self.dh_pair = DhKeypair::generate();
        let (rk2, send_ck) = kdf_rk(&self.root_key, &dh_dh(&self.dh_pair, &header.dh_public));
        self.root_key = rk2;
        self.send_chain_key = Some(send_ck);

        Ok(())
    }

    fn skip_message_keys(&mut self, until: u32) -> Result<(), CryptoError> {
        if self.recv_n.saturating_add(MAX_SKIP) < until {
            return Err(CryptoError::RatchetError);
        }
        if let Some(mut ck) = self.recv_chain_key {
            let dh = self.dh_remote.unwrap_or_default();
            while self.recv_n < until {
                let (new_ck, mk) = kdf_ck(&ck);
                ck = new_ck;
                self.skipped.insert((dh, self.recv_n), mk);
                self.recv_n += 1;
            }
            self.recv_chain_key = Some(ck);
        }
        Ok(())
    }
}

// --- KDF helpers ---

fn kdf_rk(rk: &[u8; 32], dh_out: &[u8; 32]) -> ([u8; 32], [u8; 32]) {
    let hk = Hkdf::<Sha256>::new(Some(rk), dh_out);
    let mut okm = [0u8; 64];
    hk.expand(b"mwt-v1-ratchet-rk", &mut okm).expect("hkdf");
    let mut root = [0u8; 32];
    let mut chain = [0u8; 32];
    root.copy_from_slice(&okm[..32]);
    chain.copy_from_slice(&okm[32..]);
    (root, chain)
}

fn kdf_ck(ck: &[u8; 32]) -> ([u8; 32], [u8; 32]) {
    let mut mac1 = <HmacSha256 as Mac>::new_from_slice(ck).expect("hmac");
    mac1.update(&[0x01]);
    let new_ck: [u8; 32] = mac1.finalize().into_bytes().into();

    let mut mac2 = <HmacSha256 as Mac>::new_from_slice(ck).expect("hmac");
    mac2.update(&[0x02]);
    let mk: [u8; 32] = mac2.finalize().into_bytes().into();

    (new_ck, mk)
}

/// Expand a single-use message key into an encryption key + 24-byte XChaCha20 nonce.
/// XChaCha20-Poly1305 uses a 192-bit nonce — eliminates nonce-reuse risk entirely.
/// Message key is already single-use, so this is defence-in-depth on top of that.
fn kdf_mk(mk: &[u8; 32], n: u32) -> ([u8; 32], [u8; 24]) {
    let info = n.to_le_bytes();
    let hk = Hkdf::<Sha256>::new(None, mk);
    let mut okm = [0u8; 56]; // 32 enc_key + 24 nonce
    hk.expand_multi_info(&[b"mwt-v1-msg-key", &info], &mut okm).expect("hkdf");

    let mut enc_key = [0u8; 32];
    let mut nonce   = [0u8; 24];
    enc_key.copy_from_slice(&okm[..32]);
    nonce.copy_from_slice(&okm[32..56]);
    (enc_key, nonce)
}

fn dh_dh(pair: &DhKeypair, their_pub: &[u8; 32]) -> [u8; 32] {
    let their = X25519PublicKey::from(*their_pub);
    pair.diffie_hellman(&their)
}

// --- AEAD (ChaCha20-Poly1305) ---

fn aead_encrypt(mk: &[u8; 32], n: u32, plaintext: &[u8], aad: &[u8]) -> Result<Vec<u8>, CryptoError> {
    let (enc_key, nonce_bytes) = kdf_mk(mk, n);
    let cipher = XChaCha20Poly1305::new(&enc_key.into());
    let nonce  = XNonce::from(nonce_bytes);
    let mut pt = plaintext.to_vec();
    let ct = cipher
        .encrypt(&nonce, chacha20poly1305::aead::Payload { msg: &pt, aad })
        .map_err(|_| CryptoError::Decryption)?;
    pt.zeroize();
    Ok(ct)
}

fn aead_decrypt(mk: &[u8; 32], n: u32, ciphertext: &[u8], aad: &[u8]) -> Result<Vec<u8>, CryptoError> {
    let (enc_key, nonce_bytes) = kdf_mk(mk, n);
    let cipher = XChaCha20Poly1305::new(&enc_key.into());
    let nonce  = XNonce::from(nonce_bytes);
    cipher
        .decrypt(&nonce, chacha20poly1305::aead::Payload { msg: ciphertext, aad })
        .map_err(|_| CryptoError::Decryption)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keys::DhKeypair;

    #[test]
    fn ratchet_roundtrip() {
        let bob_spk = DhKeypair::generate();
        let bob_spk_pub = bob_spk.public.to_bytes(); // copy before move
        let shared_secret = [0u8; 32]; // in real use: output of X3DH

        let mut alice = RatchetSession::init_sender(shared_secret, bob_spk_pub);
        let mut bob   = RatchetSession::init_receiver(shared_secret, bob_spk);

        let msg = alice.encrypt(b"hello bob").unwrap();
        let plaintext = bob.decrypt(&msg).unwrap();
        assert_eq!(plaintext, b"hello bob");
    }

    #[test]
    fn ratchet_out_of_order() {
        let bob_spk = DhKeypair::generate();
        let bob_spk_pub = bob_spk.public.to_bytes();
        let shared_secret = [1u8; 32];

        let mut alice = RatchetSession::init_sender(shared_secret, bob_spk_pub);
        let mut bob   = RatchetSession::init_receiver(shared_secret, bob_spk);

        let m1 = alice.encrypt(b"first").unwrap();
        let m2 = alice.encrypt(b"second").unwrap();
        let m3 = alice.encrypt(b"third").unwrap();

        // Deliver out of order — skipped keys must be buffered and replayed correctly
        assert_eq!(bob.decrypt(&m3).unwrap(), b"third");
        assert_eq!(bob.decrypt(&m1).unwrap(), b"first");
        assert_eq!(bob.decrypt(&m2).unwrap(), b"second");
    }
}
