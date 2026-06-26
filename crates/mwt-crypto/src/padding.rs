use crate::CryptoError;

/// Block size for padding. All plaintext is padded to the next multiple of this.
/// 256 bytes: small messages (typical chat) cost at most 255 extra bytes,
/// large messages blend into each other's size class.
const BLOCK: usize = 256;

/// Pad plaintext to the next block boundary using PKCS#7-style length prefix.
///
/// Format: `[original_len: u32 LE][plaintext][zero padding to block boundary]`
pub fn pad(plaintext: &[u8]) -> Vec<u8> {
    let orig_len = plaintext.len() as u32;
    let content_len = 4 + plaintext.len();
    let padded_len = ((content_len + BLOCK - 1) / BLOCK) * BLOCK;

    let mut out = Vec::with_capacity(padded_len);
    out.extend_from_slice(&orig_len.to_le_bytes());
    out.extend_from_slice(plaintext);
    out.resize(padded_len, 0);
    out
}

/// Remove padding, recovering the original plaintext.
pub fn unpad(padded: &[u8]) -> Result<Vec<u8>, CryptoError> {
    if padded.len() < 4 {
        return Err(CryptoError::InvalidKey);
    }
    let orig_len = u32::from_le_bytes(padded[..4].try_into().unwrap()) as usize;
    if 4 + orig_len > padded.len() {
        return Err(CryptoError::InvalidKey);
    }
    Ok(padded[4..4 + orig_len].to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pad_unpad_roundtrip() {
        for len in [0, 1, 100, 255, 256, 257, 1000] {
            let msg: Vec<u8> = (0..len).map(|i| (i % 251) as u8).collect();
            let padded = pad(&msg);
            assert_eq!(padded.len() % BLOCK, 0, "not block-aligned at len={len}");
            let recovered = unpad(&padded).unwrap();
            assert_eq!(recovered, msg, "roundtrip failed at len={len}");
        }
    }

    #[test]
    fn different_lengths_same_block_are_indistinguishable() {
        let a = pad(b"hi");
        let b = pad(b"hello there, this is a slightly longer message");
        // Both fit in one 256-byte block — relay sees identical sizes
        assert_eq!(a.len(), b.len());
    }
}
