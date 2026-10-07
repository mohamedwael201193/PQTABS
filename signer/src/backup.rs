//! Passphrase backup shared by the CLI and the browser signer.
//! Format: `PQTABS1` || salt (16) || nonce (12) || AES-256-GCM ciphertext.
//! The key is Argon2id at the `argon2` crate default (version 0x13, 19456 KiB, t=2, p=1).

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::Argon2;
use rand::TryRng;

pub fn encrypt(pass: &str, plain: &[u8]) -> Result<Vec<u8>, String> {
    let mut salt = [0u8; 16];
    let mut nonce = [0u8; 12];
    rand::rng().try_fill_bytes(&mut salt).map_err(|_| "rng")?;
    rand::rng().try_fill_bytes(&mut nonce).map_err(|_| "rng")?;
    let key = derive(pass, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| "aes key")?;
    let ct = cipher.encrypt(Nonce::from_slice(&nonce), plain).map_err(|_| "encrypt")?;
    let mut out = b"PQTABS1".to_vec();
    out.extend_from_slice(&salt);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ct);
    Ok(out)
}

pub fn decrypt(pass: &str, blob: &[u8]) -> Result<Vec<u8>, String> {
    if blob.len() < 7 + 16 + 12 || &blob[..7] != b"PQTABS1" {
        return Err("not a pqtabs backup".into());
    }
    let salt: [u8; 16] = blob[7..23].try_into().unwrap();
    let nonce: [u8; 12] = blob[23..35].try_into().unwrap();
    let key = derive(pass, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| "aes key")?;
    cipher
        .decrypt(Nonce::from_slice(&nonce), &blob[35..])
        .map_err(|_| "decrypt failed".into())
}

fn derive(pass: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(pass.as_bytes(), salt, &mut key)
        .map_err(|_| "argon2")?;
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wrong_passphrase_does_not_open_the_backup() {
        let blob = encrypt("correct horse", b"{\"signing_key_hex\":\"aa\"}").unwrap();
        assert!(decrypt("wrong", &blob).is_err());
        assert_eq!(decrypt("correct horse", &blob).unwrap(), b"{\"signing_key_hex\":\"aa\"}");
    }
}
