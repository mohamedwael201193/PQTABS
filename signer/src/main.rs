use pqtabs_sign::digest;
use pqtabs_sign::pq;

use std::fs;
use std::path::PathBuf;

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::Argon2;
use clap::{Parser, Subcommand};
use rand::TryRng;
use serde::{Deserialize, Serialize};
use slh_dsa::{Sha2_128s, SigningKey};

#[derive(Parser)]
#[command(name = "pqtabs-sign")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Write a new SLH-DSA-SHA2-128s key file. Does not print the secret.
    Keygen { path: PathBuf },
    /// Print the 32-byte verifying key.
    Vk { path: PathBuf },
    /// Sign a digest. Prints the signature hex only.
    Sign { path: PathBuf, digest_hex: String },
    /// Encrypt the key file with a passphrase into `out`.
    Backup { path: PathBuf, out: PathBuf },
    /// Decrypt a backup into `out` and print the verifying key.
    Restore { backup: PathBuf, out: PathBuf },
    /// Print the PQTABS_V2 digest. Does not sign.
    Digest {
        chain_id: u64,
        root: String,
        nonce: u64,
        deadline: u64,
        action_hex: String,
    },
}

#[derive(Serialize, Deserialize)]
struct KeyFile {
    scheme: String,
    signing_key_hex: String,
    verifying_key_hex: String,
}

fn main() {
    if let Err(err) = run() {
        eprintln!("error: {err}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    match Cli::parse().cmd {
        Cmd::Keygen { path } => {
            let mut rng = rand::rng();
            let sk = SigningKey::<Sha2_128s>::new(&mut rng);
            let vk = sk.as_ref();
            let vk_bytes = vk.to_bytes();
            write_key(&path, &sk, vk_bytes.as_slice())?;
            println!("{}", hex::encode(vk_bytes.as_slice()));
            Ok(())
        }
        Cmd::Vk { path } => {
            let file = read_key(&path)?;
            println!("{}", file.verifying_key_hex);
            Ok(())
        }
        Cmd::Sign { path, digest_hex } => {
            let digest = decode_32(&digest_hex)?;
            let sk = load_sk(&path)?;
            let bytes = pq::sign_digest(&sk, &digest)?;
            println!("{}", hex::encode(bytes));
            Ok(())
        }
        Cmd::Backup { path, out } => {
            let plain = fs::read(&path).map_err(|e| e.to_string())?;
            let pass = rpassword::prompt_password("backup passphrase: ").map_err(|e| e.to_string())?;
            let blob = encrypt(&pass, &plain)?;
            if let Some(parent) = out.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::write(&out, blob).map_err(|e| e.to_string())?;
            println!("wrote {}", out.display());
            Ok(())
        }
        Cmd::Restore { backup, out } => {
            let blob = fs::read(&backup).map_err(|e| e.to_string())?;
            let pass = rpassword::prompt_password("backup passphrase: ").map_err(|e| e.to_string())?;
            let plain = decrypt(&pass, &blob)?;
            let file: KeyFile = serde_json::from_slice(&plain).map_err(|e| e.to_string())?;
            if let Some(parent) = out.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::write(&out, plain).map_err(|e| e.to_string())?;
            println!("{}", file.verifying_key_hex);
            Ok(())
        }
        Cmd::Digest {
            chain_id,
            root,
            nonce,
            deadline,
            action_hex,
        } => {
            let root_bytes = decode_20(&root)?;
            let action = hex::decode(action_hex.trim_start_matches("0x")).map_err(|e| e.to_string())?;
            let hashed = digest::digest(chain_id, &root_bytes, nonce, deadline, &action);
            println!("0x{}", hex::encode(hashed));
            Ok(())
        }
    }
}

fn write_key(path: &PathBuf, sk: &SigningKey<Sha2_128s>, vk: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let file = KeyFile {
        scheme: "SLH-DSA-SHA2-128s".into(),
        signing_key_hex: hex::encode(sk.to_bytes()),
        verifying_key_hex: hex::encode(vk),
    };
    let json = serde_json::to_vec_pretty(&file).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

fn read_key(path: &PathBuf) -> Result<KeyFile, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

fn load_sk(path: &PathBuf) -> Result<SigningKey<Sha2_128s>, String> {
    let file = read_key(path)?;
    let raw = hex::decode(file.signing_key_hex).map_err(|e| e.to_string())?;
    SigningKey::<Sha2_128s>::try_from(raw.as_slice()).map_err(|_| "could not parse signing key".into())
}

fn decode_20(hex_str: &str) -> Result<[u8; 20], String> {
    let raw = hex::decode(hex_str.trim_start_matches("0x")).map_err(|e| e.to_string())?;
    raw.try_into().map_err(|_| "address must be 20 bytes".into())
}

fn decode_32(hex_str: &str) -> Result<[u8; 32], String> {
    let raw = hex::decode(hex_str.trim_start_matches("0x")).map_err(|e| e.to_string())?;
    raw.try_into().map_err(|_| "digest must be 32 bytes".into())
}

fn encrypt(pass: &str, plain: &[u8]) -> Result<Vec<u8>, String> {
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

fn decrypt(pass: &str, blob: &[u8]) -> Result<Vec<u8>, String> {
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
    fn empty_context_signature_is_7856_and_binds_the_message() {
        let mut rng = rand::rng();
        let sk = SigningKey::<Sha2_128s>::new(&mut rng);
        let msg = [0x11u8; 32];
        let sig = sk.try_sign_with_context(&msg, &[], None).unwrap();
        let raw = sig.to_vec();
        assert_eq!(raw.len(), 7856);
        assert_eq!(sk.to_bytes().len(), 64);
        assert_eq!(sk.as_ref().to_bytes().len(), 32);
        sk.as_ref().try_verify_with_context(&msg, &[], &sig).unwrap();
        let parsed = slh_dsa::Signature::<Sha2_128s>::try_from(raw.as_slice()).unwrap();
        sk.as_ref().try_verify_with_context(&msg, &[], &parsed).unwrap();
        let mut flipped = raw.clone();
        flipped[100] ^= 0x01;
        let bad = slh_dsa::Signature::<Sha2_128s>::try_from(flipped.as_slice()).unwrap();
        assert!(sk.as_ref().try_verify_with_context(&msg, &[], &bad).is_err());
        assert!(sk.as_ref().try_verify_with_context(&msg, b"ctx", &sig).is_err());
        let other = [0x22u8; 32];
        assert!(sk.as_ref().try_verify_with_context(&other, &[], &sig).is_err());
    }

    #[test]
    fn backup_roundtrip_keeps_the_signing_key() {
        let mut rng = rand::rng();
        let sk = SigningKey::<Sha2_128s>::new(&mut rng);
        let vk = sk.as_ref().to_bytes();
        let dir = std::env::temp_dir().join(format!("pqtabs-sign-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let key_path = dir.join("root.json");
        write_key(&key_path, &sk, vk.as_slice()).unwrap();
        let plain = fs::read(&key_path).unwrap();
        let blob = encrypt("correct horse", &plain).unwrap();
        assert!(decrypt("wrong", &blob).is_err());
        let restored = decrypt("correct horse", &blob).unwrap();
        assert_eq!(restored, plain);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn official_arc_vectors_match_pinned_slh_dsa() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/testdata/pq_test_vectors.json");
        let value: serde_json::Value = serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap();
        let vectors = value["slh_dsa_sha2_128s"].as_array().unwrap();
        for (index, vector) in vectors.iter().enumerate() {
            let vk_raw = decode_hex(vector["verifying_key"].as_str().unwrap());
            let msg = decode_hex(vector["message"].as_str().unwrap());
            let sig_raw = decode_hex(vector["signature"].as_str().unwrap());
            assert_eq!(vk_raw.len(), 32, "vector {index} vk");
            assert_eq!(sig_raw.len(), 7856, "vector {index} sig");
            let vk = slh_dsa::VerifyingKey::<Sha2_128s>::try_from(vk_raw.as_slice()).unwrap();
            let sig = slh_dsa::Signature::<Sha2_128s>::try_from(sig_raw.as_slice()).unwrap();
            let verified = vk.try_verify_with_context(&msg, &[], &sig).is_ok();
            assert_eq!(verified, vector["is_valid"].as_bool().unwrap(), "vector {index}");
        }
    }

    fn decode_hex(value: &str) -> Vec<u8> {
        hex::decode(value.trim_start_matches("0x")).unwrap()
    }
}
