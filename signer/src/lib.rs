//! Digest encoding and SLH-DSA-SHA2-128s signing. The CLI and the wasm package
//! both call this crate. Neither one is a second cryptography implementation.
pub mod digest;
pub mod pq;
