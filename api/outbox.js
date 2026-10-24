/**
 * /api/outbox — the encrypted outbox. The viewer leaves AES-256-GCM
 * envelopes here; the owner's Grok Bot picks them up on a schedule. Runs as
 * a Vercel Node function on the owner's own project, storing into the
 * project's own Vercel Blob store. The server never holds the key: it sees
 * ciphertext, a bearer token derived from the key, and nothing else.
 *
 *   POST   /api/outbox          body: { v:1, alg:'A256GCM', iv, ct }  → 201 { id }
 *   GET    /api/outbox          → 200 { items: [{ id, at, size, envelope }], hasMore }
 *   DELETE /api/outbox?id=…     → 200 { ok: true, id }
 *   HEAD / OPTIONS              → 204 when configured, 503 otherwise (no auth; the viewer's probe)
 *
 * Every other call needs `Authorization: Bearer <outboxToken>` where
 * sha256(outboxToken) in hex equals the OUTBOX_TOKEN_SHA256 env var. The
 * token is HMAC-SHA256(k, "grokbot-inbox/outbox/v1"), base64url, computed by
 * the viewer from the link key and by `bot/outbox.mjs token`. Format and
 * threat model: docs/RELAY.md §6.
 *
 * Env: BLOB_READ_WRITE_TOKEN (set by connecting a Blob store to the project),
 * OUTBOX_TOKEN_SHA256 (set by the bot), optional OUTBOX_BLOB_ACCESS
 * ("private", the default, or "public" for stores that predate private blobs).
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const BLOB_API = 'https://vercel.com/api/blob';
export const BLOB_API_VERSION = '13';
export const OUTBOX_PREFIX = 'outbox/';
export const MAX_BODY_BYTES = 256 * 1024;
export const LIST_LIMIT = 50;
const UPSTREAM_TIMEOUT_MS = 15_000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_POSTS = 20;
const B64URL = /^[A-Za-z0-9_-]+$/;
const ID_PATTERN = /^outbox\/[A-Za-z0-9._-]{1,120}\.enc$/;
const HEX64 = /^[0-9a-f]{64}$/;

export function readConfig(env = process.env) {
  const blobToken = typeof env.BLOB_READ_WRITE_TOKEN === 'string' ? env.BLOB_READ_WRITE_TOKEN.trim() : '';
  const tokenSha256 = typeof env.OUTBOX_TOKEN_SHA256 === 'string' ? env.OUTBOX_TOKEN_SHA256.trim().toLowerCase() : '';
  if (!blobToken || !HEX64.test(tokenSha256)) return null;
  const access = env.OUTBOX_BLOB_ACCESS === 'public' ? 'public' : 'private';
  return { blobToken, tokenSha256, access };
}

export function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Constant-time check of a presented bearer token against the stored hash. */
export function tokenMatches(presented, expectedSha256Hex) {
  if (typeof presented !== 'string' || !presented || !HEX64.test(expectedSha256Hex)) return false;
  const a = Buffer.from(sha256Hex(presented), 'hex');
  const b = Buffer.from(expectedSha256Hex, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Shape check only. The server cannot decrypt, so it accepts anything that
 * looks like an envelope: a 96-bit IV and a ciphertext at least as long as
 * the GCM tag, both base64url.
 */
export function isEnvelope(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  if (input.v !== 1 || input.alg !== 'A256GCM') return false;
  if (typeof input.iv !== 'string' || typeof input.ct !== 'string') return false;
  if (input.iv.length !== 16 || !B64URL.test(input.iv)) return false;
  if (input.ct.length < 22 || !B64URL.test(input.ct)) return false;
  for (const key of Object.keys(input)) if (!['v', 'alg', 'iv', 'ct'].includes(key)) return false;
  return true;
}

export function isOutboxId(id) {
  return typeof id === 'string' && ID_PATTERN.test(id);
}

/** `outbox/20261023T140600123Z-9f2c4a7b1e03.enc`: sortable by time, unguessable tail. */
export function makeId(now = new Date(), random = randomBytes(6).toString('hex')) {
  const stamp = now.toISOString().replace(/[-:.]/g, '');
  return `${OUTBOX_PREFIX}${stamp}-${random}.enc`;
}

export function idToTime(id) {
  const match = /^outbox\/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z-/.exec(id);
  if (!match) return '';
  const [, y, mo, d, h, mi, s, ms] = match;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}Z`;
}

function headerValue(req, name) {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function sameOrigin(req) {
  const origin = headerValue(req, 'origin');
  if (!origin) return true; // same-origin fetches and the bot's curl omit Origin
  const host = headerValue(req, 'x-forwarded-host') || headerValue(req, 'host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function bearer(req) {
  const value = headerValue(req, 'authorization');
  if (typeof value !== 'string') return '';
  const match = /^Bearer\s+(\S+)$/i.exec(value.trim());
  return match ? match[1] : '';
}

function clientIp(req) {
  const forwarded = headerValue(req, 'x-forwarded-for');
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return headerValue(req, 'x-real-ip') || req.socket?.remoteAddress || 'unknown';
}

// Best effort: one function instance's memory. Enough to blunt a loop in a
// browser; not a security boundary (the bearer token is).
const rate = new Map();
export function rateLimited(ip, now = Date.now(), max = RATE_MAX_POSTS) {
  if (rate.size > 5000) rate.clear();
  const entry = rate.get(ip);
  if (!entry || entry.resetAt <= now) {
    rate.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (typeof req.body === 'string') return resolve(req.body);
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return resolve(JSON.stringify(req.body));
    if (Buffer.isBuffer(req.body)) return resolve(req.body.toString('utf8'));
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        // Keep draining so the 413 reaches the client instead of a reset socket.
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => (tooLarge ? reject(new Error('too large')) : resolve(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', reject);
  });
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(payload === undefined ? '' : JSON.stringify(payload));
}

function queryParam(req, name) {
  const host = headerValue(req, 'host') || 'localhost';
  try {
    return new URL(req.url || '/', `https://${host}`).searchParams.get(name);
  } catch {
    return null;
  }
}

async function blobFetch(config, url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${config.blobToken}`,
        'x-api-version': BLOB_API_VERSION,
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function putItem(config, id, body) {
  const res = await blobFetch(config, `${BLOB_API}/?pathname=${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: {
      'x-vercel-blob-access': config.access,
      'x-add-random-suffix': '0',
      'x-allow-overwrite': '0',
      'x-content-type': 'application/json',
    },
    body,
  });
  if (!res.ok) throw new Error(`blob put ${res.status}`);
  return id;
}

async function listItems(config, { prefix = OUTBOX_PREFIX, limit = LIST_LIMIT } = {}) {
  const params = new URLSearchParams({ prefix, limit: String(limit) });
  const res = await blobFetch(config, `${BLOB_API}/?${params}`, { method: 'GET' });
  if (!res.ok) throw new Error(`blob list ${res.status}`);
  const data = await res.json();
  const blobs = Array.isArray(data.blobs) ? data.blobs : [];
  return { blobs, hasMore: data.hasMore === true };
}

async function readItem(config, blob) {
  const res = await blobFetch(config, blob.url, { method: 'GET', headers: { 'cache-control': 'no-store' } });
  if (!res.ok) throw new Error(`blob read ${res.status}`);
  const text = await res.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) return null;
  try {
    const parsed = JSON.parse(text);
    return isEnvelope(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function deleteItems(config, urls) {
  const res = await blobFetch(config, `${BLOB_API}/delete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ urls }),
  });
  if (!res.ok) throw new Error(`blob delete ${res.status}`);
}

export default async function handler(req, res) {
  const method = (req.method || 'GET').toUpperCase();
  const config = readConfig();
  res.setHeader('Allow', 'GET, POST, DELETE, HEAD, OPTIONS');

  if (method === 'OPTIONS' || method === 'HEAD') {
    if (!config) return send(res, 503);
    res.statusCode = 204;
    res.setHeader('Cache-Control', 'no-store');
    return res.end();
  }
  if (!['GET', 'POST', 'DELETE'].includes(method)) return send(res, 405, { error: 'GET, POST, or DELETE.' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'Cross-origin requests are not accepted.' });
  if (!config) {
    return send(res, 503, {
      error:
        'The outbox is not set up on this project. Connect a Vercel Blob store (BLOB_READ_WRITE_TOKEN) and set OUTBOX_TOKEN_SHA256; see bot/SKILL.md Part G.',
    });
  }
  if (!tokenMatches(bearer(req), config.tokenSha256)) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="outbox"');
    return send(res, 401, { error: 'Missing or wrong outbox token.' });
  }

  try {
    if (method === 'POST') {
      if (rateLimited(clientIp(req))) return send(res, 429, { error: 'Too many items in a minute. Try again shortly.' });
      let body;
      try {
        body = await readBody(req);
      } catch {
        return send(res, 413, { error: 'Item too large (256 KB max).' });
      }
      if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) return send(res, 413, { error: 'Item too large (256 KB max).' });
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        return send(res, 400, { error: 'Body must be a JSON envelope.' });
      }
      if (!isEnvelope(parsed)) return send(res, 400, { error: 'Not an outbox envelope ({ v:1, alg:"A256GCM", iv, ct }).' });
      const id = await putItem(config, makeId(), JSON.stringify(parsed));
      return send(res, 201, { id });
    }

    if (method === 'GET') {
      const { blobs, hasMore } = await listItems(config);
      const items = [];
      for (const blob of blobs) {
        if (!isOutboxId(blob.pathname)) continue;
        const envelope = await readItem(config, blob);
        if (!envelope) continue; // not ours or damaged; the bot can still DELETE it by id
        items.push({ id: blob.pathname, at: idToTime(blob.pathname) || blob.uploadedAt || '', size: blob.size ?? null, envelope });
      }
      items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      return send(res, 200, { items, hasMore });
    }

    // DELETE
    const id = queryParam(req, 'id');
    if (!isOutboxId(id)) return send(res, 400, { error: 'Pass ?id=outbox/<name>.enc.' });
    const { blobs } = await listItems(config, { prefix: id, limit: 5 });
    const match = blobs.find((blob) => blob.pathname === id);
    if (!match) return send(res, 404, { error: 'No such item.' });
    await deleteItems(config, [match.url]);
    return send(res, 200, { ok: true, id });
  } catch (err) {
    const aborted = err && typeof err === 'object' && err.name === 'AbortError';
    return send(res, 502, { error: aborted ? 'The storage did not answer in time.' : 'The storage call failed.' });
  }
}
