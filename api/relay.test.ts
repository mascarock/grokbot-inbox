import { describe, expect, it, vi } from 'vitest';
import { RELAY_ALLOWED_HOST_SUFFIXES, isAllowedRelayTarget } from '../src/lib/relayAllowlist';
import handler, { ALLOWED_HOST_SUFFIXES, isAllowedTarget } from './relay.js';

const GOOD = 'https://grok.com/routines/abc/webhook';

function fakeReq(options: { method?: string; headers?: Record<string, string>; body?: unknown }) {
  return {
    method: options.method ?? 'POST',
    headers: { host: 'grokbot-inbox-x.vercel.app', ...(options.headers ?? {}) },
    body: options.body ?? '{"type":"inbox-send","v":1}',
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
    end(text: string) {
      res.body = text;
    },
    json() {
      return JSON.parse(res.body) as Record<string, unknown>;
    },
  };
  return res;
}

describe('relay allowlist', () => {
  it('matches the viewer copy', () => {
    expect(ALLOWED_HOST_SUFFIXES).toEqual([...RELAY_ALLOWED_HOST_SUFFIXES]);
  });

  it('accepts the Grok Bot and Cursor webhook hosts over https', () => {
    for (const url of [GOOD, 'https://api.x.ai/v1/routines/1/hook', 'https://hooks.cursor.com/x', 'https://grok.com/w']) {
      expect(isAllowedTarget(url)).toBe(true);
      expect(isAllowedRelayTarget(url)).toBe(true);
    }
  });

  it('rejects everything else', () => {
    for (const url of [
      'http://grok.com/webhook',
      'https://grok.com.evil.example/webhook',
      'https://evilgrok.com/webhook',
      'https://user:pw@grok.com/webhook',
      'https://169.254.169.254/latest',
      'https://localhost/api',
      'ftp://grok.com/x',
      'not a url',
      '',
    ]) {
      expect(isAllowedTarget(url), url).toBe(false);
      expect(isAllowedRelayTarget(url), url).toBe(false);
    }
  });
});

describe('relay handler', () => {
  it('refuses non-POST', async () => {
    const res = fakeRes();
    await handler(fakeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('refuses targets off the allowlist without contacting them', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = fakeRes();
    await handler(fakeReq({ headers: { 'x-relay-target': 'https://example.com/hook', 'x-relay-auth': 'Bearer k' } }), res);
    expect(res.statusCode).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('refuses cross-origin callers', async () => {
    const res = fakeRes();
    await handler(fakeReq({ headers: { origin: 'https://attacker.example', 'x-relay-target': GOOD, 'x-relay-auth': 'Bearer k' } }), res);
    expect(res.statusCode).toBe(403);
  });

  it('requires a key and a sane header name', async () => {
    let res = fakeRes();
    await handler(fakeReq({ headers: { 'x-relay-target': GOOD } }), res);
    expect(res.statusCode).toBe(400);
    res = fakeRes();
    await handler(fakeReq({ headers: { 'x-relay-target': GOOD, 'x-relay-auth': 'Bearer k', 'x-relay-header': 'Bad Header' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('forwards the body and the configured header, returning only the status', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"r1"}', { status: 200 }));
    const res = fakeRes();
    const body = '{"type":"inbox-send","v":1,"subject":"hi"}';
    await handler(
      fakeReq({
        headers: {
          origin: 'https://grokbot-inbox-x.vercel.app',
          'x-relay-target': GOOD,
          'x-relay-header': 'X-Api-Key',
          'x-relay-auth': 'secret-key',
        },
        body,
      }),
      res,
    );
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true, status: 200 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(GOOD);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(body);
    expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('secret-key');
    expect(init.redirect).toBe('manual');
    expect(res.body).not.toContain('r1');
    fetchSpy.mockRestore();
  });

  it('maps upstream failures to 502 without leaking the upstream body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope: key xyz', { status: 401 }));
    const res = fakeRes();
    await handler(fakeReq({ headers: { 'x-relay-target': GOOD, 'x-relay-auth': 'Bearer k' } }), res);
    expect(res.statusCode).toBe(502);
    expect(res.json().status).toBe(401);
    expect(res.body).not.toContain('xyz');
    fetchSpy.mockRestore();
  });
});
