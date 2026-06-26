use mwt_crypto::recovery::RecoveryPhrase;
use mwt_crypto::pin::AccountPin;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct NewAccount {
    pub pin:          String,
    pub words:        Vec<String>,
    pub sign_key_hex: String,
    pub dh_key_hex:   String,
    pub dh_priv_hex:  String,
}

#[derive(Deserialize)]
pub struct RestoreRequest {
    pub pin:   String,
    pub words: Vec<String>,
}

/// Generate a brand-new account: PIN + identity keys + recovery phrase.
/// Keys are derived from phrase + PIN using the same path as restore_account,
/// so restore will always reproduce the same keypair.
#[tauri::command]
pub fn generate_account() -> Result<NewAccount, String> {
    let phrase  = RecoveryPhrase::generate().map_err(|e| e.to_string())?;
    let pin     = AccountPin::generate().map_err(|e| e.to_string())?;
    let pin_str = pin.to_string();

    let seed = phrase.to_seed(&pin_str);

    let sign_bytes: [u8; 32] = seed[..32].try_into()
        .map_err(|_| "seed slice error".to_string())?;
    let signing_key  = ed25519_dalek::SigningKey::from_bytes(&sign_bytes);
    let sign_pub_hex = hex::encode(signing_key.verifying_key().as_bytes());

    let dh_bytes: [u8; 32] = seed[32..64].try_into()
        .map_err(|_| "seed slice error".to_string())?;
    let dh_priv_hex = hex::encode(dh_bytes);
    let dh_secret  = x25519_dalek::StaticSecret::from(dh_bytes);
    let dh_pub_hex = hex::encode(x25519_dalek::PublicKey::from(&dh_secret).as_bytes());

    Ok(NewAccount {
        pin:          pin_str,
        words:        phrase.words(),
        sign_key_hex: sign_pub_hex,
        dh_key_hex:   dh_pub_hex,
        dh_priv_hex,
    })
}

/// Verify recovery phrase + PIN on a new device. Derives public keys from the seed
/// so the frontend can re-register with the relay.
#[tauri::command]
pub fn restore_account(req: RestoreRequest) -> Result<NewAccount, String> {
    let phrase_str = req.words.join(" ");
    let phrase = RecoveryPhrase::from_words(&phrase_str)
        .map_err(|_| "Invalid recovery phrase".to_string())?;

    let seed = phrase.to_seed(&req.pin);

    // Derive Ed25519 signing key from first 32 seed bytes
    let sign_bytes: [u8; 32] = seed[..32].try_into().unwrap();
    let signing_key  = ed25519_dalek::SigningKey::from_bytes(&sign_bytes);
    let sign_pub_hex = hex::encode(signing_key.verifying_key().as_bytes());

    // Derive X25519 DH key from second 32 seed bytes
    let dh_bytes: [u8; 32] = seed[32..].try_into().unwrap();
    let dh_priv_hex = hex::encode(dh_bytes);
    let dh_secret  = x25519_dalek::StaticSecret::from(dh_bytes);
    let dh_pub_hex = hex::encode(x25519_dalek::PublicKey::from(&dh_secret).as_bytes());

    Ok(NewAccount {
        pin:          req.pin,
        words:        req.words,
        sign_key_hex: sign_pub_hex,
        dh_key_hex:   dh_pub_hex,
        dh_priv_hex,
    })
}

/// Confirm one word of the recovery phrase by index during the backup flow.
#[tauri::command]
pub fn verify_phrase_word(words: Vec<String>, index: usize, guess: String) -> bool {
    words.get(index).map(|w| w == &guess.trim().to_lowercase()).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_and_restore_produce_same_keys() {
        let result = generate_account().expect("generate_account failed");

        let restore_req = RestoreRequest {
            pin:   result.pin.clone(),
            words: result.words.clone(),
        };
        let restored = restore_account(restore_req).expect("restore_account failed");

        assert_eq!(
            result.sign_key_hex, restored.sign_key_hex,
            "Ed25519 public key mismatch between generate and restore"
        );
        assert_eq!(
            result.dh_key_hex, restored.dh_key_hex,
            "X25519 public key mismatch between generate and restore"
        );
    }

    #[test]
    fn restore_is_deterministic() {
        let result = generate_account().expect("generate_account failed");

        let r1 = restore_account(RestoreRequest {
            pin:   result.pin.clone(),
            words: result.words.clone(),
        }).expect("restore 1 failed");

        let r2 = restore_account(RestoreRequest {
            pin:   result.pin.clone(),
            words: result.words.clone(),
        }).expect("restore 2 failed");

        assert_eq!(r1.sign_key_hex, r2.sign_key_hex);
        assert_eq!(r1.dh_key_hex,   r2.dh_key_hex);
    }

    #[test]
    fn verify_phrase_word_correct_guess() {
        let words = vec!["alpha".to_string(), "bravo".to_string(), "charlie".to_string()];
        assert!(verify_phrase_word(words.clone(), 1, "bravo".to_string()));
    }

    #[test]
    fn verify_phrase_word_trims_and_lowercases() {
        let words = vec!["alpha".to_string()];
        assert!(verify_phrase_word(words, 0, "  ALPHA  ".to_string()));
    }

    #[test]
    fn verify_phrase_word_wrong_guess() {
        let words = vec!["alpha".to_string()];
        assert!(!verify_phrase_word(words, 0, "beta".to_string()));
    }

    #[test]
    fn verify_phrase_word_out_of_bounds() {
        let words = vec!["alpha".to_string()];
        assert!(!verify_phrase_word(words, 99, "alpha".to_string()));
    }
}
