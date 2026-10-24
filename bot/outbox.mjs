#!/usr/bin/env node
/**
 * outbox.mjs — the bot's side of the encrypted outbox. Node 20+, no dependencies.
 *
 *   node outbox.mjs token --key-file ~/.grokbot-inbox/<handle>.key
 *        → prints the hex sha256 of the outbox bearer token: the value of the
 *          OUTBOX_TOKEN_SHA256 env var on the owner's Vercel project
 *   node outbox.mjs probe --url https://grokbot-inbox-<handle>.vercel.app
 *        → "ready" (exit 0) when /api/outbox is configured, else the status and exit 1
 *   node outbox.mjs pull --url https://grokbot-inbox-<handle>.vercel.app --key-file …
 *        → fetches every pending item, decrypts and validates it, prints a JSON array
 *          [{ "id", "at", "payload" }] (or { "id", "at", "error" } for items that do
 *          not decrypt). Prints [] and exits 0 when the outbox is empty.
 *   node outbox.mjs ack --url … --key-file … --id outbox/… [--id …]
 *        → deletes the items once you have shown their draft cards
 *
 * The token is HMAC-SHA256(key = k, message = "grokbot-inbox/outbox/v1"),
 * base64url. Items are AES-256-GCM with the same k and the additional data
 * "grokbot-inbox/outbox/v1". Format: docs/RELAY.md §6. The key file is the
 * one from encrypt_inbox.mjs keygen; never print it or send it anywhere.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';

const { subtle } = webcrypto;
const KEY_BYTES = 32;
const IV_BYTES = 12;
export const OUTBOX_AAD = 'grokbot-inbox/outbox/v1';
export const OUTBOX_TOKEN_INFO = 'grokbot-inbox/outbox/v1';
export const OUTBOX_PATH = '/api/outbox';
const PAYLOAD_TYPES = ['inbox-send', 'inbox-refresh', 'inbox-action'];
const SEND_KINDS = ['new', 'reply', 'reply-all', 'forward'];
const ACTIONS = ['archive', 'unarchive', 'star', 'unstar', 'read', 'unread'];
const ADDRESS = /^[^\s<>,;"@]+@[^\s<>,;"@]+\.[^\s<>,;"@]+$/;

function b64url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(text) {
  const normalized = text.trim().replace(/-/g, '+').replace(/_/g, '/');
  return new Uint8Array(Buffer.from(normalized + '='.repeat((4 - (normalized.length % 4)) % 4), 'base64'));
}

function parseArgs(argv) {
  const out = { _: [], id: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const name = arg.slice(2);
      const next = argv[i + 1];
      const value = next === undefined || next.startsWith('--') ? true : (i++, next);
      if (name === 'id') out.id.push(String(value));
      else out[name] = value;
    } else out._.push(arg);
  }
  return out;
}

function fail(message, code = 1) {
  console.error(`outbox: ${message}`);
  process.exit(code);
}

function normalizeKey(raw) {
  const bytes = fromB64url(String(raw));
  if (bytes.length !== KEY_BYTES) throw new Error('the key is not 256 bits');
  return b64url(bytes);
}

function readKey(args) {
  let raw = args['key-file'] ? readFileSync(args['key-file'], 'utf8') : undefined;
  if (!raw && typeof args.key === 'string') raw = existsSync(args.key) ? readFileSync(args.key, 'utf8') : args.key;
  if (!raw) raw = process.env.INBOX_KEY;
  if (!raw) fail('provide --key-file <path> (preferred), --key <base64url|path>, or INBOX_KEY');
  try {
    return normalizeKey(raw);
  } catch (err) {
    return fail(err.message);
  }
}

/** Bearer token for /api/outbox, base64url. */
export async function deriveToken(keyB64) {
  const raw = fromB64url(keyB64);
  if (raw.length !== KEY_BYTES) throw new Error('the key is not 256 bits');
  const key = await subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await subtle.sign('HMAC', key, Buffer.from(OUTBOX_TOKEN_INFO, 'utf8'))));
}

/** What goes into the OUTBOX_TOKEN_SHA256 env var. */
export function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export async function encryptItem(plaintext, keyB64) {
  const key = await subtle.importKey('raw', fromB64url(keyB64), { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = new Uint8Array(IV_BYTES);
  webcrypto.getRandomValues(iv);
  const ct = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: Buffer.from(OUTBOX_AAD, 'utf8') }, key, Buffer.from(plaintext, 'utf8')),
  );
  return { v: 1, alg: 'A256GCM', iv: b64url(iv), ct: b64url(ct) };
}

export async function decryptItem(envelope, keyB64) {
  if (!envelope || envelope.v !== 1 || envelope.alg !== 'A256GCM' || typeof envelope.iv !== 'string' || typeof envelope.ct !== 'string') {
    throw new Error('unsupported envelope');
  }
  const iv = fromB64url(envelope.iv);
  if (iv.length !== IV_BYTES) throw new Error('bad iv');
  const key = await subtle.importKey('raw', fromB64url(keyB64), { name: 'AES-GCM' }, false, ['decrypt']);
  let plain;
  try {
    plain = await subtle.decrypt({ name: 'AES-GCM', iv, additionalData: Buffer.from(OUTBOX_AAD, 'utf8') }, key, fromB64url(envelope.ct));
  } catch {
    throw new Error('the key does not open this item');
  }
  return Buffer.from(plain).toString('utf8');
}

function isRecipientList(value) {
  return (
    Array.isArray(value) &&
    value.every(
      (r) =>
        r &&
        typeof r === 'object' &&
        typeof r.address === 'string' &&
        ADDRESS.test(r.address) &&
        (r.name === undefined || (typeof r.name === 'string' && !/[\r\n<>"]/.test(r.name))),
    )
  );
}

/**
 * Structural check of a decrypted payload (docs/RELAY.md §4). Passing this
 * only means the JSON has the right shape; SKILL.md Part C still applies:
 * the bot re-parses `command`, checks the sender is its own mailbox, and
 * shows a draft card. Returns { ok: true, payload } or { ok: false, reason }.
 */
export function validatePayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, reason: 'not a JSON object' };
  if (input.v !== 1) return { ok: false, reason: `unsupported payload version ${String(input.v)}` };
  if (!PAYLOAD_TYPES.includes(input.type)) return { ok: false, reason: `unknown type ${String(input.type)}` };
  if (typeof input.sentAt !== 'string' || Number.isNaN(Date.parse(input.sentAt))) return { ok: false, reason: 'sentAt is not a date' };
  if (input.type === 'inbox-send') {
    if (typeof input.from !== 'string' || !ADDRESS.test(input.from)) return { ok: false, reason: 'from is not an address' };
    if (!SEND_KINDS.includes(input.kind)) return { ok: false, reason: `unknown kind ${String(input.kind)}` };
    if (!isRecipientList(input.to) || input.to.length === 0) return { ok: false, reason: 'to must list at least one valid address' };
    if (!isRecipientList(input.cc)) return { ok: false, reason: 'cc has an invalid recipient' };
    if (typeof input.subject !== 'string' || /[\r\n]/.test(input.subject)) return { ok: false, reason: 'subject must be one line' };
    if (typeof input.body !== 'string' || !input.body.trim()) return { ok: false, reason: 'body is empty' };
    if (typeof input.command !== 'string' || !input.command.startsWith('/inbox-send v1')) return { ok: false, reason: 'command block missing' };
    for (const field of ['threadId', 'inReplyTo']) {
      if (input[field] !== undefined && (typeof input[field] !== 'string' || /[\r\n]/.test(input[field]))) return { ok: false, reason: `${field} must be one line` };
    }
    return { ok: true, payload: input };
  }
  if (typeof input.inbox !== 'string' || !ADDRESS.test(input.inbox)) return { ok: false, reason: 'inbox is not an address' };
  if (input.type === 'inbox-action') {
    if (!ACTIONS.includes(input.action)) return { ok: false, reason: `unknown action ${String(input.action)}` };
    if (typeof input.threadId !== 'string' || !input.threadId) return { ok: false, reason: 'threadId missing' };
  }
  return { ok: true, payload: input };
}

function endpoint(base) {
  if (!base) fail('--url https://grokbot-inbox-<handle>.vercel.app is required');
  const url = new URL(base);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') fail('--url must be https');
  url.pathname = OUTBOX_PATH;
  url.search = '';
  url.hash = '';
  return url;
}

async function call(url, token, init = {}, fetchFn = fetch) {
  const res = await fetchFn(url, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, data };
}

/** Everything `pull` does, as a function (used by the tests and callable from other scripts). */
export async function pull(base, keyB64, fetchFn = fetch) {
  const token = await deriveToken(keyB64);
  const { status, data } = await call(endpoint(base), token, { method: 'GET' }, fetchFn);
  if (status === 401) throw new Error('401: the token does not match OUTBOX_TOKEN_SHA256 on the project (re-run `token` and update the env var)');
  if (status === 503) throw new Error(`503: ${data?.error ?? 'the outbox is not configured on this project'}`);
  if (status !== 200) throw new Error(`the outbox answered ${status}${data?.error ? `: ${data.error}` : ''}`);
  const out = [];
  for (const item of Array.isArray(data?.items) ? data.items : []) {
    const base = { id: item.id, at: item.at ?? '' };
    try {
      const plain = await decryptItem(item.envelope, keyB64);
      const checked = validatePayload(JSON.parse(plain));
      out.push(checked.ok ? { ...base, payload: checked.payload } : { ...base, error: checked.reason });
    } catch (err) {
      out.push({ ...base, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { items: out, hasMore: data?.hasMore === true };
}

export async function ack(base, keyB64, ids, fetchFn = fetch) {
  const token = await deriveToken(keyB64);
  const results = [];
  for (const id of ids) {
    const url = endpoint(base);
    url.searchParams.set('id', id);
    const { status, data } = await call(url, token, { method: 'DELETE' }, fetchFn);
    results.push({ id, ok: status === 200 || status === 404, status, error: data?.error });
  }
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (command === 'token') {
    console.log(sha256Hex(await deriveToken(readKey(args))));
    return;
  }

  if (command === 'probe') {
    const res = await fetch(endpoint(args.url), { method: 'HEAD' });
    if (res.status === 204) {
      console.log('ready');
      return;
    }
    console.log(res.status === 503 ? 'not configured (503)' : res.status === 404 ? 'no /api/outbox on this deployment (404)' : `status ${res.status}`);
    process.exit(1);
  }

  if (command === 'pull') {
    const { items, hasMore } = await pull(args.url, readKey(args));
    console.log(JSON.stringify(items, null, 2));
    if (hasMore) console.error('outbox: more items are waiting; ack these and pull again');
    return;
  }

  if (command === 'ack') {
    if (args.id.length === 0) fail('--id outbox/… is required (repeatable)');
    const results = await ack(args.url, readKey(args), args.id);
    for (const r of results) console.error(`${r.ok ? 'acked' : 'failed'} ${r.id}${r.ok ? '' : ` (${r.status}${r.error ? `: ${r.error}` : ''})`}`);
    if (results.some((r) => !r.ok)) process.exit(1);
    return;
  }

  console.error('usage: outbox.mjs token|probe|pull|ack [options]  (see header comment)');
  process.exit(2);
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
}
