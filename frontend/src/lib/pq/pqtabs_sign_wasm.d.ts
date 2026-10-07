/* tslint:disable */
/* eslint-disable */

export function backup_decrypt_utf8(passphrase: string, blob_hex: string): string;

export function backup_encrypt_hex(passphrase: string, plaintext_utf8: string): string;

export function digest_hex(chain_id: bigint, root_hex: string, nonce: bigint, deadline: bigint, action_hex: string): string;

export function keygen_json(): string;

export function sign_hex(signing_key_hex: string, digest_hex: string): string;

export function verify_hex(verifying_key_hex: string, digest_hex: string, signature_hex: string): boolean;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly backup_decrypt_utf8: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly backup_encrypt_hex: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly digest_hex: (a: bigint, b: number, c: number, d: bigint, e: bigint, f: number, g: number) => [number, number, number, number];
    readonly keygen_json: () => [number, number, number, number];
    readonly sign_hex: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly verify_hex: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
