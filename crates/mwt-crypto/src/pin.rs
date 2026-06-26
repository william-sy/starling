use rand::{Rng, rngs::OsRng};
use zeroize::ZeroizeOnDrop;
use crate::CryptoError;

const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion
const PIN_SEGMENTS: usize = 4;
const SEGMENT_LEN: usize = 4;

/// Human-readable account PIN — the "telephone number" of mwt.
/// Format: XXXX-XXXX-XXXX-XXXX (4 segments of 4 chars, 80 bits, unambiguous alphabet)
#[derive(Clone, ZeroizeOnDrop)]
pub struct AccountPin(String);

impl AccountPin {
    pub fn generate() -> Result<Self, CryptoError> {
        let mut rng = OsRng;
        let mut segments = Vec::with_capacity(PIN_SEGMENTS);

        for _ in 0..PIN_SEGMENTS {
            let seg: String = (0..SEGMENT_LEN)
                .map(|_| ALPHABET[rng.gen_range(0..ALPHABET.len())] as char)
                .collect();
            segments.push(seg);
        }

        Ok(Self(segments.join("-")))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for AccountPin {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}
