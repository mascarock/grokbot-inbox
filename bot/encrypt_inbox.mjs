#!/usr/bin/env node
/**
 * encrypt_inbox.mjs — turn an inbox export into the encrypted snapshot the
 * viewer fetches from its own origin. Node 20+, no dependencies.
 *
 *   node encrypt_inbox.mjs keygen                       → prints a new base64url 256-bit key
 *   node encrypt_inbox.mjs encrypt --in export.json --key-file ~/.grokbot-inbox/<handle>.key \
 *        --out-dir /tmp/publish [--seq-file ~/.grokbot-inbox/<handle>.seq] [--no-compress] \
 *        [--webhook-url https://…] [--key-header Authorization] [--key-prefix "Bearer "] \
 *        [--outbox] [--acked outbox/a.enc,outbox/b.enc | --acked acked.json]
 *   node encrypt_inbox.mjs link --base https://grokbot-inbox-<handle>.vercel.app/ --key-file …
 *   node encrypt_inbox.mjs decrypt --in inbox.enc --key-file …      (round-trip check)
 *
 * `encrypt` writes <out-dir>/inbox.enc and <out-dir>/inbox.meta.json, and
 * bumps the sequence counter in --seq-file (or <key-file>.seq). The key file
 * is created by `keygen --key-file …` with mode 0600. Never commit it, never
 * upload it, never put it in a chat. Format: docs/RELAY.md.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { webcrypto } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

const { subtle } = webcrypto;
const getRandomValues = (bytes) => webcrypto.getRandomValues(bytes);
const KEY_BYTES = 32;
const IV_BYTES = 12;

function b64url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(text) {
  const normalized = text.trim().replace(/-/g, '+').replace(/_/g, '/');
  return new Uint8Array(Buffer.from(normalized + '='.repeat((4 - (normalized.length % 4)) % 4), 'base64'));
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const name = arg.slice(2);
      const next = argv[i + 1];
      const value = next === undefined || next.startsWith('--') ? true : (i++, next);
      // A repeated flag collects its values (used by --acked).
      out[name] = name in out ? [].concat(out[name], value) : value;
    } else out._.push(arg);
  }
  return out;
}

function fail(message) {
  console.error(`encrypt_inbox: ${message}`);
  process.exit(1);
}

export function generateKey() {
  const bytes = new Uint8Array(KEY_BYTES);
  getRandomValues(bytes);
  return b64url(bytes);
}

function readKey(args) {
  const raw = args['key'] ?? (args['key-file'] ? readFileSync(args['key-file'], 'utf8') : process.env.INBOX_KEY);
  if (!raw) fail('provide --key-file <path> (preferred), --key <base64url>, or INBOX_KEY');
  const bytes = fromB64url(String(raw));
  if (bytes.length !== KEY_BYTES) fail('the key is not 256 bits');
  return b64url(bytes);
}

async function importKey(keyB64, usage) {
  return subtle.importKey('raw', fromB64url(keyB64), { name: 'AES-GCM' }, false, [usage]);
}

export async function encrypt(plaintext, keyB64, { seq, updatedAt = new Date().toISOString(), compress = true } = {}) {
  const key = await importKey(keyB64, 'encrypt');
  const iv = new Uint8Array(IV_BYTES);
  getRandomValues(iv);
  const bytes = Buffer.from(plaintext, 'utf8');
  const input = compress ? deflateRawSync(bytes, { level: 9 }) : bytes;
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, input));
  const envelope = { v: 1, alg: 'A256GCM', iv: b64url(iv), ct: b64url(ct), updatedAt, seq };
  if (compress) envelope.cmp = 'deflate-raw';
  return envelope;
}

export async function decrypt(envelope, keyB64) {
  if (envelope.v !== 1 || envelope.alg !== 'A256GCM') throw new Error('unsupported envelope');
  const key = await importKey(keyB64, 'decrypt');
  const plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(envelope.iv) }, key, fromB64url(envelope.ct)));
  const bytes = envelope.cmp === 'deflate-raw' ? inflateRawSync(plain) : plain;
  return Buffer.from(bytes).toString('utf8');
}

/**
 * inbox.meta.json. `--outbox` tells the viewer /api/outbox is set up (Part G);
 * `--acked id,id` (repeatable, or a path to a JSON array) lists outbox items
 * the bot has handled so the viewer drops them from its "waiting" list.
 */
export function buildMeta(seq, updatedAt, args = {}) {
  const meta = { seq, updatedAt };
  if (args.outbox) meta.outbox = true;
  const acked = [];
  for (const value of [].concat(args.acked ?? [])) {
    if (value === true) continue;
    const text = String(value);
    if (existsSync(text)) {
      const parsed = JSON.parse(readFileSync(text, 'utf8'));
      if (Array.isArray(parsed)) acked.push(...parsed.filter((id) => typeof id === 'string'));
    } else acked.push(...text.split(',').map((id) => id.trim()).filter(Boolean));
  }
  if (acked.length) meta.outboxAcked = [...new Set(acked)].slice(-200);
  return meta;
}

function nextSeq(seqFile) {
  let current = 0;
  if (existsSync(seqFile)) {
    const n = Number.parseInt(readFileSync(seqFile, 'utf8').trim(), 10);
    if (Number.isFinite(n)) current = n;
  }
  // Also never go backwards against the clock, so a lost seq file is harmless.
  const next = Math.max(current + 1, Math.floor(Date.now() / 1000) - 1_700_000_000);
  mkdirSync(dirname(seqFile), { recursive: true });
  writeFileSync(seqFile, `${next}\n`);
  return next;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (command === 'keygen') {
    const key = generateKey();
    if (args['key-file']) {
      if (existsSync(args['key-file']) && !args.force) fail(`${args['key-file']} exists; pass --force to overwrite (the old link stops working)`);
      mkdirSync(dirname(args['key-file']), { recursive: true });
      writeFileSync(args['key-file'], `${key}\n`, { mode: 0o600 });
      console.error(`wrote ${args['key-file']}`);
    } else console.log(key);
    return;
  }

  if (command === 'link') {
    const base = args.base;
    if (!base) fail('--base https://grokbot-inbox-<handle>.vercel.app/ is required');
    const key = readKey(args);
    console.log(`${base.endsWith('/') ? base : `${base}/`}#k=${key}`);
    return;
  }

  if (command === 'encrypt') {
    const inPath = args.in;
    if (!inPath) fail('--in export.json is required');
    const key = readKey(args);
    const text = readFileSync(inPath, 'utf8');
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.threads)) fail('--in is not an inbox export (no "threads" array)');
    if (args['webhook-url'] || args['key-header'] || args['key-prefix'] !== undefined) {
      parsed.relay = { ...(parsed.relay ?? {}) };
      if (args['webhook-url']) parsed.relay.webhookUrl = String(args['webhook-url']);
      if (args['key-header']) parsed.relay.keyHeader = String(args['key-header']);
      if (args['key-prefix'] !== undefined) parsed.relay.keyPrefix = String(args['key-prefix'] === true ? '' : args['key-prefix']);
    }
    const seqFile = args['seq-file'] ?? (args['key-file'] ? `${args['key-file']}.seq` : join(process.cwd(), '.inbox.seq'));
    const seq = nextSeq(seqFile);
    const updatedAt = new Date().toISOString();
    const envelope = await encrypt(JSON.stringify(parsed), key, { seq, updatedAt, compress: !args['no-compress'] });
    const outDir = args['out-dir'] ?? '.';
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'inbox.enc'), JSON.stringify(envelope));
    writeFileSync(join(outDir, 'inbox.meta.json'), JSON.stringify(buildMeta(seq, updatedAt, args)));
    console.error(`wrote ${join(outDir, 'inbox.enc')} (seq ${seq}, ${envelope.ct.length} chars) and inbox.meta.json`);
    return;
  }

  if (command === 'decrypt') {
    const inPath = args.in;
    if (!inPath) fail('--in inbox.enc is required');
    const key = readKey(args);
    const envelope = JSON.parse(readFileSync(inPath, 'utf8'));
    process.stdout.write(await decrypt(envelope, key));
    return;
  }

  console.error('usage: encrypt_inbox.mjs keygen|encrypt|link|decrypt [options]  (see header comment)');
  process.exit(2);
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
}
