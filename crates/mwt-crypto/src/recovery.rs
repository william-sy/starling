use bip39::{Mnemonic, Language};
use rand::RngCore;
use rand::rngs::OsRng;
use zeroize::ZeroizeOnDrop;
use crate::CryptoError;

/// BIP39 recovery phrase — the root secret shown once at signup.
#[derive(ZeroizeOnDrop)]
pub struct RecoveryPhrase {
    #[zeroize(skip)] // Mnemonic doesn't implement Zeroize; entropy field below is what matters
    mnemonic: Mnemonic,
    entropy: Vec<u8>,
}

impl RecoveryPhrase {
    pub fn generate() -> Result<Self, CryptoError> {
        // 32 bytes = 256 bits entropy = 24 words
        let mut entropy = [0u8; 32];
        OsRng.fill_bytes(&mut entropy);
        let mnemonic = Mnemonic::from_entropy_in(Language::English, &entropy)
            .map_err(|_| CryptoError::PinGeneration)?;
        let entropy = mnemonic.to_entropy();
        Ok(Self { mnemonic, entropy })
    }

    pub fn from_words(words: &str) -> Result<Self, CryptoError> {
        let mnemonic = Mnemonic::parse_in(Language::English, words)
            .map_err(|_| CryptoError::InvalidRecoveryPhrase)?;
        let entropy = mnemonic.to_entropy();
        Ok(Self { mnemonic, entropy })
    }

    pub fn words(&self) -> Vec<String> {
        self.mnemonic.words().map(str::to_owned).collect()
    }

    /// Derive root key material from the phrase (used to restore account on new device).
    pub fn to_seed(&self, pin: &str) -> [u8; 64] {
        self.mnemonic.to_seed(pin)
    }
}
