//! Browser entry points for the same crate the CLI uses.
//! Key bytes stay in the caller. This module does not log them.

use slh_dsa::{Sha2_128s, SigningKey, VerifyingKey};
use wasm_bindgen::prelude::*;

fn decode_hex(value: &str) -> Result<Vec<u8>, JsValue> {
    hex::decode(value.trim_start_matches("0x")).map_err(|err| JsValue::from_str(&err.to_string()))
}

#[wasm_bindgen]
pub fn digest_hex(chain_id: u64, root_hex: &str, nonce: u64, deadline: u64, action_hex: &str) -> Result<String, JsValue> {
    let root = decode_hex(root_hex)?;
    let root: [u8; 20] = root.try_into().map_err(|_| JsValue::from_str("root must be 20 bytes"))?;
    let action = decode_hex(action_hex)?;
    let hashed = pqtabs_sign::digest::digest(chain_id, &root, nonce, deadline, &action);
    Ok(format!("0x{}", hex::encode(hashed)))
}

#[wasm_bindgen]
pub fn sign_hex(signing_key_hex: &str, digest_hex: &str) -> Result<String, JsValue> {
    let sk_raw = decode_hex(signing_key_hex)?;
    let digest_raw = decode_hex(digest_hex)?;
    let digest: [u8; 32] = digest_raw
        .try_into()
        .map_err(|_| JsValue::from_str("digest must be 32 bytes"))?;
    let sk = SigningKey::<Sha2_128s>::try_from(sk_raw.as_slice()).map_err(|_| JsValue::from_str("bad signing key"))?;
    let sig = pqtabs_sign::pq::sign_digest(&sk, &digest).map_err(|err| JsValue::from_str(&err))?;
    Ok(hex::encode(sig))
}

#[wasm_bindgen]
pub fn verify_hex(verifying_key_hex: &str, digest_hex: &str, signature_hex: &str) -> Result<bool, JsValue> {
    let vk_raw = decode_hex(verifying_key_hex)?;
    let digest_raw = decode_hex(digest_hex)?;
    let sig = decode_hex(signature_hex)?;
    let digest: [u8; 32] = digest_raw
        .try_into()
        .map_err(|_| JsValue::from_str("digest must be 32 bytes"))?;
    let vk = VerifyingKey::<Sha2_128s>::try_from(vk_raw.as_slice()).map_err(|_| JsValue::from_str("bad verifying key"))?;
    Ok(pqtabs_sign::pq::verify_digest(&vk, &digest, &sig))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn browser_digest_matches_the_golden_vector() {
        let agent = [0x11u8; 20];
        let payee = [0x22u8; 20];
        let action = pqtabs_sign::digest::encode_open(&agent, &[payee], 200_000, 1_893_456_000, 1_000_000);
        let got = digest_hex(5042, &hex::encode([0x33u8; 20]), 7, 1_893_456_000, &hex::encode(action)).unwrap();
        assert_eq!(got, "0xb89923a0c10a21a5d6fc2de3558799654b0de9621028cdbf4c05bca63ca251bf");
    }
}
