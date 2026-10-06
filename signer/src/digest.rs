//! ABI digest for PQTABS_V2. Must match PQRoot.digestFor.

use sha3::{Digest, Keccak256};

pub fn keccak256(data: &[u8]) -> [u8; 32] {
    let mut h = Keccak256::new();
    h.update(data);
    h.finalize().into()
}

fn word_u256(v: u128, high: u128) -> [u8; 32] {
    let mut out = [0u8; 32];
    out[0..16].copy_from_slice(&high.to_be_bytes());
    out[16..32].copy_from_slice(&v.to_be_bytes());
    out
}

fn word_u64(v: u64) -> [u8; 32] {
    word_from_u128(v as u128)
}

fn word_from_u128(v: u128) -> [u8; 32] {
    let mut out = [0u8; 32];
    out[16..32].copy_from_slice(&v.to_be_bytes());
    out
}

fn word_addr(addr: &[u8; 20]) -> [u8; 32] {
    let mut out = [0u8; 32];
    out[12..32].copy_from_slice(addr);
    out
}

pub fn domain() -> [u8; 32] {
    keccak256(b"PQTABS_V2")
}

/// abi.encode(uint8, address, address[], uint256, uint64, uint256)
pub fn encode_open(agent: &[u8; 20], payees: &[[u8; 20]], max_per_call: u128, expiry: u64, cap: u128) -> Vec<u8> {
    let mut out = Vec::with_capacity(32 * (6 + 1 + payees.len()));
    out.extend_from_slice(&word_from_u128(1));
    out.extend_from_slice(&word_addr(agent));
    out.extend_from_slice(&word_from_u128(192));
    out.extend_from_slice(&word_from_u128(max_per_call));
    out.extend_from_slice(&word_u64(expiry));
    out.extend_from_slice(&word_from_u128(cap));
    out.extend_from_slice(&word_from_u128(payees.len() as u128));
    for payee in payees {
        out.extend_from_slice(&word_addr(payee));
    }
    out
}

pub fn encode_close(tab: &[u8; 20]) -> Vec<u8> {
    let mut out = Vec::with_capacity(64);
    out.extend_from_slice(&word_from_u128(2));
    out.extend_from_slice(&word_addr(tab));
    out
}

pub fn encode_transfer(to: &[u8; 20], amount: u128) -> Vec<u8> {
    let mut out = Vec::with_capacity(96);
    out.extend_from_slice(&word_from_u128(3));
    out.extend_from_slice(&word_addr(to));
    out.extend_from_slice(&word_from_u128(amount));
    out
}

pub fn encode_rotate(new_vk: &[u8; 32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(64);
    out.extend_from_slice(&word_from_u128(4));
    out.extend_from_slice(new_vk);
    out
}

pub fn encode_exposure(new_max: u128) -> Vec<u8> {
    let mut out = Vec::with_capacity(64);
    out.extend_from_slice(&word_from_u128(5));
    out.extend_from_slice(&word_from_u128(new_max));
    out
}

pub fn digest(chain_id: u64, root: &[u8; 20], nonce: u64, deadline: u64, action: &[u8]) -> [u8; 32] {
    let mut preimage = Vec::with_capacity(192);
    preimage.extend_from_slice(&domain());
    preimage.extend_from_slice(&word_u256(chain_id as u128, 0));
    preimage.extend_from_slice(&word_addr(root));
    preimage.extend_from_slice(&word_u64(nonce));
    preimage.extend_from_slice(&word_u64(deadline));
    preimage.extend_from_slice(&keccak256(action));
    keccak256(&preimage)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_head_is_six_words_then_array() {
        let agent = [0x11u8; 20];
        let payee = [0x22u8; 20];
        let encoded = encode_open(&agent, &[payee], 200_000, 1_893_456_000, 1_000_000);
        assert_eq!(encoded.len(), 32 * 8);
        assert_eq!(&encoded[0..32], &word_from_u128(1));
        let offset = u128::from_be_bytes(encoded[80..96].try_into().unwrap());
        assert_eq!(offset, 192);
    }

    #[test]
    fn digest_matches_cast_abi_encode() {
        let agent = [0x11u8; 20];
        let payee = [0x22u8; 20];
        let action = encode_open(&agent, &[payee], 200_000, 1_893_456_000, 1_000_000);
        let expected_action = hex_to_vec("0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000111111111111111111111111111111111111111100000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000030d400000000000000000000000000000000000000000000000000000000070dbd88000000000000000000000000000000000000000000000000000000000000f424000000000000000000000000000000000000000000000000000000000000000010000000000000000000000002222222222222222222222222222222222222222");
        assert_eq!(action, expected_action);
        assert_eq!(
            hex::encode(domain()),
            "a679b30f73c42f98a44c9a4b0ef7d9ae94fc893727137427cd38def237e83dba"
        );
        let root = [0x33u8; 20];
        let got = digest(5042, &root, 7, 1_893_456_000, &action);
        assert_eq!(
            hex::encode(got),
            "b89923a0c10a21a5d6fc2de3558799654b0de9621028cdbf4c05bca63ca251bf"
        );
    }

    #[test]
    fn static_actions_use_the_kind_word() {
        let tab = [0x44u8; 20];
        assert_eq!(&encode_close(&tab)[..32], &word_from_u128(2));
        assert_eq!(&encode_transfer(&tab, 9)[..32], &word_from_u128(3));
        assert_eq!(&encode_rotate(&[0x55u8; 32])[..32], &word_from_u128(4));
        assert_eq!(&encode_exposure(12)[..32], &word_from_u128(5));
        let _ = keccak256(&[1]);
        let _ = word_u256(1, 0);
    }

    fn hex_to_vec(s: &str) -> Vec<u8> {
        (0..s.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
            .collect()
    }
}
