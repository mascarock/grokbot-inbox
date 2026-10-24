import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveOutboxToken, encryptOutboxItem, generateKeyB64, sha256Hex as viewerSha256 } from '../src/lib/crypto';
import handler, { BLOB_API, idToTime, isEnvelope, isOutboxId, makeId, rateLimited, readConfig, sha256Hex, tokenMatches } from './outbox.js';

const KEY = generateKeyB64();
const BLOB_TOKEN = 'vercel_blob_rw_store123_secretsecret';
let TOKEN = '';

function fakeReq(options: { method?: string; url?: string; headers?: Record<string, string>; body?: unknown; auth?: boolean }) {
  const headers: Record<string, string> = { host: 'grokbot-inbox-x.vercel.app', ...(options.headers ?? {}) };
  if (options.auth !== false && !('authorization' in headers)) headers.authorization = `Bearer ${TOKEN}`;
  return {
    method: options.method ?? 'POST',
    url: options.url ?? '/api/outbox',
    headers,
    body: options.body,
    socket: { remoteAddress: '203.0.113.9' },
    on() {},
  };
}

function fakeRes() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(name: string, value: string) {
      res.headers[name] = value;
    },
    end(text?: string) {
      res.body = text ?? '';
    },
    json() {
      return JSON.parse(res.body) as Record<string, unknown>;
    },
  };
  return res;
}

/** In-memory stand-in for the Vercel Blob REST API. */
function fakeBlobStore() {
  const blobs = new Map<string, string>();
  const calls: { method: string; url: string; headers: Record<string, string> }[] = [];
  const urlFor = (pathname: string) => `https://store123.private.blob.vercel-storage.com/${pathname}`;
  const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = Object.fromEntries(Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    calls.push({ method, url, headers });
    if (headers.authorization !== `Bearer ${BLOB_TOKEN}`) return new Response('{"error":"forbidden"}', { status: 403 });
    const parsed = new URL(url);
    if (url.startsWith(`${BLOB_API}/delete`)) {
      const { urls } = JSON.parse(String(init?.body)) as { urls: string[] };
      for (const u of urls) for (const [pathname] of blobs) if (urlFor(pathname) === u) blobs.delete(pathname);
      return new Response('null', { status: 200 });
    }
    if (url.startsWith(`${BLOB_API}/`) && method === 'PUT') {
      const pathname = parsed.searchParams.get('pathname') ?? '';
      if (headers['x-allow-overwrite'] !== '1' && blobs.has(pathname)) return new Response('{"error":"exists"}', { status: 409 });
      blobs.set(pathname, String(init?.body));
      return new Response(JSON.stringify({ url: urlFor(pathname), downloadUrl: urlFor(pathname), pathname, contentType: 'application/json' }), { status: 200 });
    }
    if (url.startsWith(`${BLOB_API}/`) && method === 'GET') {
      const prefix = parsed.searchParams.get('prefix') ?? '';
      const limit = Number(parsed.searchParams.get('limit') ?? '1000');
      const matching = [...blobs.keys()].filter((p) => p.startsWith(prefix)).sort();
      const page = matching.slice(0, limit).map((pathname) => ({
        url: urlFor(pathname),
        downloadUrl: urlFor(pathname),
        pathname,
        size: blobs.get(pathname)!.length,
        uploadedAt: '2026-10-23T14:06:00.000Z',
      }));
      return new Response(JSON.stringify({ blobs: page, hasMore: matching.length > limit, cursor: null }), { status: 200 });
    }
    if (parsed.hostname === 'store123.private.blob.vercel-storage.com' && method === 'GET') {
      const pathname = parsed.pathname.slice(1);
      const content = blobs.get(pathname);
      return content === undefined ? new Response('', { status: 404 }) : new Response(content, { status: 200 });
    }
    return new Response('unexpected', { status: 500 });
  });
  return { blobs, calls, fetchFn };
}

describe('outbox helpers', () => {
  it('derives the same token hash as the viewer and compares in constant time', async () => {
    const token = await deriveOutboxToken(KEY);
    const expected = await viewerSha256(token);
    expect(sha256Hex(token)).toBe(expected);
    expect(tokenMatches(token, expected)).toBe(true);
    expect(tokenMatches(`${token}x`, expected)).toBe(false);
    expect(tokenMatches('', expected)).toBe(false);
    expect(tokenMatches(token, 'nothex')).toBe(false);
  });

  it('reads config only when both env vars are present and sane', () => {
    expect(readConfig({})).toBeNull();
    expect(readConfig({ BLOB_READ_WRITE_TOKEN: 'x' })).toBeNull();
    expect(readConfig({ BLOB_READ_WRITE_TOKEN: 'x', OUTBOX_TOKEN_SHA256: 'short' })).toBeNull();
    const hash = sha256Hex('t');
    expect(readConfig({ BLOB_READ_WRITE_TOKEN: 'x', OUTBOX_TOKEN_SHA256: hash.toUpperCase() })).toEqual({ blobToken: 'x', tokenSha256: hash, access: 'private' });
    expect(readConfig({ BLOB_READ_WRITE_TOKEN: 'x', OUTBOX_TOKEN_SHA256: hash, OUTBOX_BLOB_ACCESS: 'public' })?.access).toBe('public');
  });

  it('accepts only the envelope shape', async () => {
    const good = await encryptOutboxItem('{"type":"inbox-send"}', KEY);
    expect(isEnvelope(good)).toBe(true);
    expect(isEnvelope({ ...good, v: 2 })).toBe(false);
    expect(isEnvelope({ ...good, alg: 'none' })).toBe(false);
    expect(isEnvelope({ ...good, iv: 'short' })).toBe(false);
    expect(isEnvelope({ ...good, ct: 'tiny' })).toBe(false);
    expect(isEnvelope({ ...good, ct: `${good.ct}+/=` })).toBe(false);
    expect(isEnvelope({ ...good, extra: 1 })).toBe(false);
    expect(isEnvelope({ type: 'inbox-send', v: 1, subject: 'plaintext' })).toBe(false);
    expect(isEnvelope(null)).toBe(false);
    expect(isEnvelope([])).toBe(false);
  });

  it('makes sortable ids under outbox/ and reads the time back', () => {
    const id = makeId(new Date('2026-10-23T14:06:00.123Z'), 'abcdef012345');
    expect(id).toBe('outbox/20261023T140600123Z-abcdef012345.enc');
    expect(isOutboxId(id)).toBe(true);
    expect(idToTime(id)).toBe('2026-10-23T14:06:00.123Z');
    expect(isOutboxId('inbox.enc')).toBe(false);
    expect(isOutboxId('outbox/../inbox.enc')).toBe(false);
    expect(isOutboxId('outbox/x.json')).toBe(false);
  });

  it('rate limits per ip within a window', () => {
    const ip = `ip-${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(rateLimited(ip, 1000, 3)).toBe(false);
    expect(rateLimited(ip, 1000, 3)).toBe(true);
    expect(rateLimited(ip, 1000 + 61_000, 3)).toBe(false);
  });
});

describe('outbox handler', () => {
  let store: ReturnType<typeof fakeBlobStore>;
  const env = { ...process.env };

  beforeEach(async () => {
    TOKEN = await deriveOutboxToken(KEY);
    process.env.BLOB_READ_WRITE_TOKEN = BLOB_TOKEN;
    process.env.OUTBOX_TOKEN_SHA256 = sha256Hex(TOKEN);
    delete process.env.OUTBOX_BLOB_ACCESS;
    store = fakeBlobStore();
    vi.stubGlobal('fetch', store.fetchFn);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.BLOB_READ_WRITE_TOKEN = env.BLOB_READ_WRITE_TOKEN;
    process.env.OUTBOX_TOKEN_SHA256 = env.OUTBOX_TOKEN_SHA256;
    if (env.BLOB_READ_WRITE_TOKEN === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    if (env.OUTBOX_TOKEN_SHA256 === undefined) delete process.env.OUTBOX_TOKEN_SHA256;
  });

  it('answers the probe with 204 when configured and 503 when not, without auth', async () => {
    let res = fakeRes();
    await handler(fakeReq({ method: 'HEAD', auth: false }), res);
    expect(res.statusCode).toBe(204);
    res = fakeRes();
    await handler(fakeReq({ method: 'OPTIONS', auth: false }), res);
    expect(res.statusCode).toBe(204);

    delete process.env.OUTBOX_TOKEN_SHA256;
    res = fakeRes();
    await handler(fakeReq({ method: 'HEAD', auth: false }), res);
    expect(res.statusCode).toBe(503);
    expect(store.fetchFn).not.toHaveBeenCalled();
  });

  it('explains what is missing with 503 before checking the token', async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const res = fakeRes();
    await handler(fakeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(503);
    expect(String(res.json().error)).toContain('BLOB_READ_WRITE_TOKEN');
    expect(store.fetchFn).not.toHaveBeenCalled();
  });

  it('refuses a missing or wrong token with 401 and never touches storage', async () => {
    const attempts: Record<string, string>[] = [{}, { authorization: 'Bearer nope' }, { authorization: `Basic ${TOKEN}` }, { authorization: `Bearer ${TOKEN}extra` }];
    for (const headers of attempts) {
      const res = fakeRes();
      await handler(fakeReq({ method: 'GET', auth: false, headers }), res);
      expect(res.statusCode, JSON.stringify(headers)).toBe(401);
    }
    expect(store.fetchFn).not.toHaveBeenCalled();
  });

  it('refuses cross-origin callers', async () => {
    const res = fakeRes();
    await handler(fakeReq({ headers: { origin: 'https://attacker.example' }, body: '{}' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('refuses other methods', async () => {
    const res = fakeRes();
    await handler(fakeReq({ method: 'PUT' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('rejects oversize and malformed bodies', async () => {
    let res = fakeRes();
    await handler(fakeReq({ body: 'x'.repeat(256 * 1024 + 1) }), res);
    expect(res.statusCode).toBe(413);
    res = fakeRes();
    await handler(fakeReq({ body: 'not json' }), res);
    expect(res.statusCode).toBe(400);
    res = fakeRes();
    await handler(fakeReq({ body: '{"type":"inbox-send","v":1,"subject":"plaintext"}' }), res);
    expect(res.statusCode).toBe(400);
    expect(store.blobs.size).toBe(0);
  });

  it('stores an envelope as a private blob and returns its id', async () => {
    const envelope = await encryptOutboxItem('{"type":"inbox-send","v":1}', KEY);
    const res = fakeRes();
    await handler(fakeReq({ headers: { origin: 'https://grokbot-inbox-x.vercel.app' }, body: JSON.stringify(envelope) }), res);
    expect(res.statusCode).toBe(201);
    const { id } = res.json() as { id: string };
    expect(isOutboxId(id)).toBe(true);
    expect(store.blobs.get(id)).toBe(JSON.stringify(envelope));
    const put = store.calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toBe(`${BLOB_API}/?pathname=${encodeURIComponent(id)}`);
    expect(put.headers['x-vercel-blob-access']).toBe('private');
    expect(put.headers['x-add-random-suffix']).toBe('0');
    expect(put.headers['x-api-version']).toBe('13');
    expect(res.body).not.toContain(BLOB_TOKEN);
  });

  it('lists pending items with their envelopes, oldest first, skipping junk', async () => {
    const a = await encryptOutboxItem('{"n":1}', KEY);
    const b = await encryptOutboxItem('{"n":2}', KEY);
    store.blobs.set(makeId(new Date('2026-10-23T14:07:00.000Z'), 'bbbbbbbbbbbb'), JSON.stringify(b));
    store.blobs.set(makeId(new Date('2026-10-23T14:06:00.000Z'), 'aaaaaaaaaaaa'), JSON.stringify(a));
    store.blobs.set('outbox/20261023T140800000Z-cccccccccccc.enc', 'not json');
    store.blobs.set('inbox.enc', '{"v":1}');
    const res = fakeRes();
    await handler(fakeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    const { items, hasMore } = res.json() as { items: { id: string; at: string; envelope: unknown }[]; hasMore: boolean };
    expect(hasMore).toBe(false);
    expect(items.map((i) => i.envelope)).toEqual([a, b]);
    expect(items[0].at).toBe('2026-10-23T14:06:00.000Z');
    const list = store.calls.find((c) => c.method === 'GET' && c.url.startsWith(BLOB_API))!;
    expect(new URL(list.url).searchParams.get('prefix')).toBe('outbox/');
    expect(new URL(list.url).searchParams.get('limit')).toBe('50');
  });

  it('deletes one item by id and 404s for unknown ids', async () => {
    const id = makeId(new Date(), 'dddddddddddd');
    store.blobs.set(id, JSON.stringify(await encryptOutboxItem('{}', KEY)));
    let res = fakeRes();
    await handler(fakeReq({ method: 'DELETE', url: `/api/outbox?id=${encodeURIComponent(id)}` }), res);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, id });
    expect(store.blobs.has(id)).toBe(false);

    res = fakeRes();
    await handler(fakeReq({ method: 'DELETE', url: `/api/outbox?id=${encodeURIComponent(id)}` }), res);
    expect(res.statusCode).toBe(404);

    res = fakeRes();
    await handler(fakeReq({ method: 'DELETE', url: '/api/outbox?id=inbox.enc' }), res);
    expect(res.statusCode).toBe(400);
    res = fakeRes();
    await handler(fakeReq({ method: 'DELETE' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('maps storage failures to 502 without leaking details', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('token vercel_blob_rw_leak', { status: 500 })));
    const res = fakeRes();
    await handler(fakeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain('leak');
  });
});
