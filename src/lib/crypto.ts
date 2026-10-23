import { deflateSync, inflateSync } from 'fflate';
import { fromBase64Url, toBase64Url } from './linkCodec';

/**
 * Encrypted snapshot envelope. The bot writes `inbox.enc` with this shape
 * and the 256-bit key travels only in the link fragment (`#k=`), so the
 * hosting origin sees ciphertext and nothing else. Format: docs/RELAY.md.
 */
export interface SnapshotEnvelope {
  v: 1;
  alg: 'A256GCM';
  /** 96-bit IV, base64url. */
  iv: string;
  /** Ciphertext with the 128-bit GCM tag appended, base64url. */
  ct: string;
  /** ISO-8601 time the bot produced the snapshot. */
  updatedAt: string;
  /** Monotonic counter; the viewer refreshes when it grows. */
  seq: number;
  /** Plaintext compression before encryption. Absent means none. */
  cmp?: 'deflate-raw';
}

/** Tiny sidecar the viewer polls so it only downloads the envelope when it changed. */
export interface SnapshotMeta {
  seq: number;
  updatedAt: string;
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const KEY_BYTES = 32;
const IV_BYTES = 12;

function subtle(): SubtleCrypto {
  const api = globalThis.crypto?.subtle;
  if (!api) throw new SnapshotError('This browser has no WebCrypto; the encrypted inbox cannot be opened here.');
  return api;
}

export function isValidKey(keyB64: string): boolean {
  try {
    return fromBase64Url(keyB64.trim()).length === KEY_BYTES;
  } catch {
    return false;
  }
}

export async function importKey(keyB64: string, usages: KeyUsage[] = ['decrypt']): Promise<CryptoKey> {
  let raw: Uint8Array;
  try {
    raw = fromBase64Url(keyB64.trim());
  } catch {
    throw new SnapshotError('The key in the link is not valid base64url.');
  }
  if (raw.length !== KEY_BYTES) throw new SnapshotError('The key in the link is not 256 bits.');
  return subtle().importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, usages);
}

export function generateKeyB64(): string {
  const bytes = new Uint8Array(KEY_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function encryptSnapshot(
  plaintext: string,
  keyB64: string,
  options: { seq: number; updatedAt?: string; compress?: boolean },
): Promise<SnapshotEnvelope> {
  const key = await importKey(keyB64, ['encrypt']);
  const iv = new Uint8Array(IV_BYTES);
  globalThis.crypto.getRandomValues(iv);
  const compress = options.compress ?? true;
  const bytes = new TextEncoder().encode(plaintext);
  const input = compress ? deflateSync(bytes, { level: 9 }) : bytes;
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, input as BufferSource));
  const envelope: SnapshotEnvelope = {
    v: 1,
    alg: 'A256GCM',
    iv: toBase64Url(iv),
    ct: toBase64Url(ct),
    updatedAt: options.updatedAt ?? new Date().toISOString(),
    seq: options.seq,
  };
  if (compress) envelope.cmp = 'deflate-raw';
  return envelope;
}

export function parseEnvelope(input: unknown): SnapshotEnvelope {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new SnapshotError('The snapshot is not a JSON object.');
  const raw = input as Record<string, unknown>;
  if (raw.v !== 1) throw new SnapshotError(`Unsupported snapshot version: ${String(raw.v)}`);
  if (raw.alg !== 'A256GCM') throw new SnapshotError(`Unsupported snapshot algorithm: ${String(raw.alg)}`);
  if (typeof raw.iv !== 'string' || typeof raw.ct !== 'string') throw new SnapshotError('The snapshot is missing iv or ct.');
  if (raw.cmp !== undefined && raw.cmp !== 'deflate-raw') throw new SnapshotError(`Unsupported compression: ${String(raw.cmp)}`);
  const seq = typeof raw.seq === 'number' && Number.isFinite(raw.seq) ? raw.seq : 0;
  const updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : '';
  const envelope: SnapshotEnvelope = { v: 1, alg: 'A256GCM', iv: raw.iv, ct: raw.ct, updatedAt, seq };
  if (raw.cmp === 'deflate-raw') envelope.cmp = 'deflate-raw';
  return envelope;
}

export async function decryptSnapshot(envelope: SnapshotEnvelope, keyB64: string): Promise<string> {
  const key = await importKey(keyB64);
  let iv: Uint8Array;
  let ct: Uint8Array;
  try {
    iv = fromBase64Url(envelope.iv);
    ct = fromBase64Url(envelope.ct);
  } catch {
    throw new SnapshotError('The snapshot is not valid base64url.');
  }
  if (iv.length !== IV_BYTES) throw new SnapshotError('The snapshot IV has the wrong length.');
  let plain: ArrayBuffer;
  try {
    plain = await subtle().decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ct as BufferSource);
  } catch {
    throw new SnapshotError('This key does not open the snapshot. Ask your bot for a fresh link.');
  }
  const bytes = new Uint8Array(plain);
  const decoded = envelope.cmp === 'deflate-raw' ? inflateSync(bytes) : bytes;
  return new TextDecoder().decode(decoded);
}

export function parseSnapshotMeta(input: unknown): SnapshotMeta | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.seq !== 'number') return null;
  return { seq: raw.seq, updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '' };
}

/** `#k=<key>` in a fragment. Returns the key or null. */
export function readKeyFragment(hash: string): string | null {
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(text);
  const key = params.get('k');
  return key && isValidKey(key) ? key.trim() : null;
}

export function buildKeyLink(base: string, keyB64: string): string {
  const normalized = base.endsWith('/') ? base : `${base}/`;
  return `${normalized}#k=${keyB64}`;
}
