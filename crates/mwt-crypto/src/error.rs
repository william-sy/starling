use thiserror::Error;

#[derive(Debug, Error)]
pub enum CryptoError {
    #[error("key derivation failed")]
    Kdf,
    #[error("decryption failed")]
    Decryption,
    #[error("invalid key material")]
    InvalidKey,
    #[error("signature verification failed")]
    SignatureInvalid,
    #[error("ratchet state exhausted or invalid")]
    RatchetError,
    #[error("invalid recovery phrase")]
    InvalidRecoveryPhrase,
    #[error("pin generation failed")]
    PinGeneration,
}
