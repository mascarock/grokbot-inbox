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
  /** The bot set up the encrypted outbox (`/api/outbox`) on this project. */
  outbox?: boolean;
  /** Outbox item ids the bot has processed since; the viewer drops them from its queue. */
  outboxAcked?: string[];
}

/**
 * Envelope for one item the viewer leaves in the outbox for the bot.
 * Same AES-256-GCM key as the snapshot, bound to OUTBOX_AAD so a snapshot
 * ciphertext can never be replayed as an outbox item or vice versa.
 */
export interface OutboxEnvelope {
  v: 1;
  alg: 'A256GCM';
  iv: string;
  ct: string;
}

export const OUTBOX_AAD = 'grokbot-inbox/outbox/v1';
/** HMAC info string for the outbox bearer token derived from the snapshot key. */
export const OUTBOX_TOKEN_INFO = 'grokbot-inbox/outbox/v1';

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

async function sealBytes(input: Uint8Array, keyB64: string, aad?: string): Promise<{ iv: string; ct: string }> {
  const key = await importKey(keyB64, ['encrypt']);
  const iv = new Uint8Array(IV_BYTES);
  globalThis.crypto.getRandomValues(iv);
  const params: AesGcmParams = { name: 'AES-GCM', iv: iv as BufferSource };
  if (aad) params.additionalData = new TextEncoder().encode(aad) as BufferSource;
  const ct = new Uint8Array(await subtle().encrypt(params, key, input as BufferSource));
  return { iv: toBase64Url(iv), ct: toBase64Url(ct) };
}

async function openBytes(ivB64: string, ctB64: string, keyB64: string, aad: string | undefined, failure: string): Promise<Uint8Array> {
  const key = await importKey(keyB64);
  let iv: Uint8Array;
  let ct: Uint8Array;
  try {
    iv = fromBase64Url(ivB64);
    ct = fromBase64Url(ctB64);
  } catch {
    throw new SnapshotError('The envelope is not valid base64url.');
  }
  if (iv.length !== IV_BYTES) throw new SnapshotError('The envelope IV has the wrong length.');
  const params: AesGcmParams = { name: 'AES-GCM', iv: iv as BufferSource };
  if (aad) params.additionalData = new TextEncoder().encode(aad) as BufferSource;
  try {
    return new Uint8Array(await subtle().decrypt(params, key, ct as BufferSource));
  } catch {
    throw new SnapshotError(failure);
  }
}

export async function encryptSnapshot(
  plaintext: string,
  keyB64: string,
  options: { seq: number; updatedAt?: string; compress?: boolean },
): Promise<SnapshotEnvelope> {
  const compress = options.compress ?? true;
  const bytes = new TextEncoder().encode(plaintext);
  const input = compress ? deflateSync(bytes, { level: 9 }) : bytes;
  const { iv, ct } = await sealBytes(input, keyB64);
  const envelope: SnapshotEnvelope = {
    v: 1,
    alg: 'A256GCM',
    iv,
    ct,
    updatedAt: options.updatedAt ?? new Date().toISOString(),
    seq: options.seq,
  };
  if (compress) envelope.cmp = 'deflate-raw';
  return envelope;
}

/** Seals one outbox item (plaintext JSON) for the bot. */
export async function encryptOutboxItem(plaintext: string, keyB64: string): Promise<OutboxEnvelope> {
  const { iv, ct } = await sealBytes(new TextEncoder().encode(plaintext), keyB64, OUTBOX_AAD);
  return { v: 1, alg: 'A256GCM', iv, ct };
}

export async function decryptOutboxItem(envelope: OutboxEnvelope, keyB64: string): Promise<string> {
  const bytes = await openBytes(envelope.iv, envelope.ct, keyB64, OUTBOX_AAD, 'This key does not open the outbox item.');
  return new TextDecoder().decode(bytes);
}

export function parseOutboxEnvelope(input: unknown): OutboxEnvelope {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new SnapshotError('The outbox item is not a JSON object.');
  const raw = input as Record<string, unknown>;
  if (raw.v !== 1 || raw.alg !== 'A256GCM') throw new SnapshotError('Unsupported outbox envelope.');
  if (typeof raw.iv !== 'string' || typeof raw.ct !== 'string') throw new SnapshotError('The outbox item is missing iv or ct.');
  return { v: 1, alg: 'A256GCM', iv: raw.iv, ct: raw.ct };
}

/**
 * Bearer token for `/api/outbox`: HMAC-SHA256(key = k, message = info),
 * base64url. The server stores only sha256(token), so neither the token nor
 * k ever needs to leave the owner's devices and the bot.
 */
export async function deriveOutboxToken(keyB64: string): Promise<string> {
  let raw: Uint8Array;
  try {
    raw = fromBase64Url(keyB64.trim());
  } catch {
    throw new SnapshotError('The key is not valid base64url.');
  }
  if (raw.length !== KEY_BYTES) throw new SnapshotError('The key is not 256 bits.');
  const hmacKey = await subtle().importKey('raw', raw as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await subtle().sign('HMAC', hmacKey, new TextEncoder().encode(OUTBOX_TOKEN_INFO) as BufferSource);
  return toBase64Url(new Uint8Array(mac));
}

/** Hex sha256 of a token, what the bot stores in OUTBOX_TOKEN_SHA256. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await subtle().digest('SHA-256', new TextEncoder().encode(text) as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
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
  const bytes = await openBytes(envelope.iv, envelope.ct, keyB64, undefined, 'This key does not open the snapshot. Ask your bot for a fresh link.');
  const decoded = envelope.cmp === 'deflate-raw' ? inflateSync(bytes) : bytes;
  return new TextDecoder().decode(decoded);
}

export function parseSnapshotMeta(input: unknown): SnapshotMeta | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.seq !== 'number') return null;
  const meta: SnapshotMeta = { seq: raw.seq, updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '' };
  if (raw.outbox === true) meta.outbox = true;
  if (Array.isArray(raw.outboxAcked)) meta.outboxAcked = raw.outboxAcked.filter((id): id is string => typeof id === 'string');
  return meta;
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
