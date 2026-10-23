/**
 * /api/relay — forwards one POST from the viewer to the owner's Grok Bot
 * webhook, server to server, for browsers that cannot reach the webhook
 * directly (CORS). Runs as a Vercel Node function on the owner's own
 * project; there is no shared relay anywhere.
 *
 * Headers from the viewer:
 *   X-Relay-Target  https URL of the webhook (must match the allowlist)
 *   X-Relay-Header  header name that carries the sender key (default Authorization)
 *   X-Relay-Auth    full header value, e.g. "Bearer <key>"
 *
 * The body is passed through unchanged and never logged. Only the status
 * code comes back. Keep ALLOWED_HOST_SUFFIXES in sync with
 * src/lib/relayAllowlist.ts (api/relay.test.ts checks).
 */

export const ALLOWED_HOST_SUFFIXES = ['x.ai', 'grok.com', 'cursor.com', 'cursor.sh'];
const MAX_BODY_BYTES = 256 * 1024;
const UPSTREAM_TIMEOUT_MS = 15_000;
const HEADER_NAME = /^[A-Za-z0-9-]{1,64}$/;

export function isAllowedTarget(url, suffixes = ALLOWED_HOST_SUFFIXES) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  const host = parsed.hostname.toLowerCase();
  return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function headerValue(req, name) {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function sameOrigin(req) {
  const origin = headerValue(req, 'origin');
  if (!origin) return true; // same-origin fetches may omit Origin; curl does too, that is fine
  const host = headerValue(req, 'x-forwarded-host') || headerValue(req, 'host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
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
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'POST only.' });
  }
  if (!sameOrigin(req)) return send(res, 403, { error: 'Cross-origin requests are not relayed.' });

  const target = headerValue(req, 'x-relay-target');
  if (!target || !isAllowedTarget(target)) {
    return send(res, 400, { error: 'The webhook host is not on this relay\'s allowlist.' });
  }
  const headerName = headerValue(req, 'x-relay-header') || 'Authorization';
  if (!HEADER_NAME.test(headerName)) return send(res, 400, { error: 'Invalid key header name.' });
  const auth = headerValue(req, 'x-relay-auth');
  if (!auth || /[\r\n]/.test(auth)) return send(res, 400, { error: 'Missing sender key.' });

  let body;
  try {
    body = await readBody(req);
  } catch {
    return send(res, 413, { error: 'Body too large.' });
  }
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) return send(res, 413, { error: 'Body too large.' });
  try {
    JSON.parse(body);
  } catch {
    return send(res, 400, { error: 'Body must be JSON.' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [headerName]: auth, 'User-Agent': 'grokbot-inbox-relay/1' },
      body,
      redirect: 'manual',
      signal: controller.signal,
    });
    if (upstream.ok) return send(res, 202, { ok: true, status: upstream.status });
    return send(res, 502, { error: `The bot answered ${upstream.status}.`, status: upstream.status });
  } catch (err) {
    const aborted = err && typeof err === 'object' && err.name === 'AbortError';
    return send(res, 504, { error: aborted ? 'The bot did not answer in time.' : 'Could not reach the bot.' });
  } finally {
    clearTimeout(timer);
  }
}
