//! SLH-DSA-SHA2-128s over the raw 32-byte PQTABS digest. Empty context.
//! The browser package and the CLI both call these functions.

use slh_dsa::{Sha2_128s, Signature, SigningKey, VerifyingKey};

pub const SIG_LEN: usize = 7856;

/// Same `SigningKey::new` the CLI uses. Returns the 64-byte signing key and the 32-byte verifying key.
pub fn generate_keypair() -> (Vec<u8>, Vec<u8>) {
    let mut rng = rand::rng();
    let sk = SigningKey::<Sha2_128s>::new(&mut rng);
    let vk = sk.as_ref().to_bytes();
    (sk.to_bytes().to_vec(), vk.to_vec())
}

pub fn sign_digest(sk: &SigningKey<Sha2_128s>, digest: &[u8; 32]) -> Result<Vec<u8>, String> {
    let sig = sk
        .try_sign_with_context(digest, &[], None)
        .map_err(|_| "sign failed")?;
    let bytes = sig.to_vec();
    if bytes.len() != SIG_LEN {
        return Err(format!("unexpected signature length {}", bytes.len()));
    }
    Ok(bytes)
}

pub fn verify_digest(vk: &VerifyingKey<Sha2_128s>, digest: &[u8; 32], signature: &[u8]) -> bool {
    let Ok(sig) = Signature::<Sha2_128s>::try_from(signature) else {
        return false;
    };
    vk.try_verify_with_context(digest, &[], &sig).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sign_digest_verifies_and_a_flipped_byte_does_not() {
        let mut rng = rand::rng();
        let sk = SigningKey::<Sha2_128s>::new(&mut rng);
        let digest = [0x44u8; 32];
        let sig = sign_digest(&sk, &digest).unwrap();
        assert!(verify_digest(sk.as_ref(), &digest, &sig));
        let mut bad = sig.clone();
        bad[10] ^= 0x01;
        assert!(!verify_digest(sk.as_ref(), &digest, &bad));
        assert!(!verify_digest(sk.as_ref(), &digest, &sig[..100]));
    }
}
