import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatSendCommand, parseCommand } from './command';
import {
  applyPrefill,
  buildActionPayload,
  buildRefreshPayload,
  buildSendPayload,
  deliver,
  isConfigured,
  loadWebhookSettings,
  saveWebhookSettings,
  type WebhookSettings,
} from './webhook';

const SETTINGS: WebhookSettings = {
  url: 'https://grok.com/routines/r1/webhook',
  key: 'sk-test',
  header: 'Authorization',
  prefix: 'Bearer ',
  viaRelay: false,
};

const COMMAND = {
  from: 'me@mail.grokbot.com',
  kind: 'reply' as const,
  thread: 'thr_1',
  inReplyTo: 'msg_9',
  to: [{ name: 'Ana', address: 'ana@example.com' }],
  cc: [{ address: 'cc@example.com' }],
  subject: 'Re: Hello',
  body: 'Thanks!\n---\nnot a separator',
};

describe('payload building', () => {
  it('mirrors the /inbox-send command fields', () => {
    const text = formatSendCommand(COMMAND);
    const payload = buildSendPayload(COMMAND, text, new Date('2026-10-23T12:00:00Z'));
    expect(payload).toMatchObject({
      type: 'inbox-send',
      v: 1,
      from: COMMAND.from,
      kind: 'reply',
      threadId: 'thr_1',
      inReplyTo: 'msg_9',
      to: [{ name: 'Ana', address: 'ana@example.com' }],
      cc: [{ address: 'cc@example.com' }],
      subject: 'Re: Hello',
      body: COMMAND.body,
      sentAt: '2026-10-23T12:00:00.000Z',
    });
    // The embedded command parses back to the same message, so a bot can
    // reuse its Part C parser on webhook payloads.
    const parsed = parseCommand(payload.command);
    expect(parsed.type).toBe('send');
    if (parsed.type === 'send') {
      expect(parsed.command.body).toBe(COMMAND.body);
      expect(parsed.command.to).toEqual(COMMAND.to);
      expect(parsed.command.thread).toBe('thr_1');
    }
  });

  it('omits thread fields for new messages', () => {
    const payload = buildSendPayload({ ...COMMAND, kind: 'new', thread: undefined, inReplyTo: undefined }, 'x');
    expect(payload.kind).toBe('new');
    expect('threadId' in payload).toBe(false);
    expect('inReplyTo' in payload).toBe(false);
  });

  it('builds refresh and action payloads', () => {
    expect(buildRefreshPayload('me@mail.grokbot.com', new Date(0))).toEqual({ type: 'inbox-refresh', v: 1, inbox: 'me@mail.grokbot.com', sentAt: '1970-01-01T00:00:00.000Z' });
    expect(buildActionPayload('me@x', 'archive', 't1', new Date(0))).toMatchObject({ type: 'inbox-action', action: 'archive', threadId: 't1' });
  });
});

describe('settings', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips through localStorage with defaults for missing fields', () => {
    saveWebhookSettings(SETTINGS);
    expect(loadWebhookSettings()).toEqual(SETTINGS);
    localStorage.setItem('grokbot-inbox-webhook', '{"url":"https://grok.com/w","key":"k"}');
    expect(loadWebhookSettings()).toEqual({ url: 'https://grok.com/w', key: 'k', header: 'Authorization', prefix: 'Bearer ', viaRelay: false });
  });

  it('requires https and a key to count as configured', () => {
    expect(isConfigured(SETTINGS)).toBe(true);
    expect(isConfigured({ ...SETTINGS, key: ' ' })).toBe(false);
    expect(isConfigured({ ...SETTINGS, url: 'http://grok.com/w' })).toBe(false);
  });

  it('prefills the URL from the snapshot but never the key, and respects user edits', () => {
    const empty = loadWebhookSettings();
    const filled = applyPrefill(empty, { webhookUrl: 'https://grok.com/routines/a/webhook', keyHeader: 'X-Api-Key', keyPrefix: '' });
    expect(filled.url).toBe('https://grok.com/routines/a/webhook');
    expect(filled.header).toBe('X-Api-Key');
    expect(filled.prefix).toBe('');
    expect(filled.key).toBe('');
    // A rotated URL from the bot replaces the previous prefill...
    const rotated = applyPrefill(filled, { webhookUrl: 'https://grok.com/routines/b/webhook' });
    expect(rotated.url).toBe('https://grok.com/routines/b/webhook');
    // ...but not a URL the user typed.
    const typed = { ...rotated, url: 'https://grok.com/mine' };
    expect(applyPrefill(typed, { webhookUrl: 'https://grok.com/routines/c/webhook' }).url).toBe('https://grok.com/mine');
    expect(applyPrefill(typed, undefined)).toBe(typed);
  });
});

describe('deliver', () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const makeFetch = (plan: (url: string) => Response | Error) =>
    (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init: init ?? {} });
      const result = plan(url);
      if (result instanceof Error) throw result;
      return result;
    }) as typeof fetch;

  beforeEach(() => {
    calls.length = 0;
  });
  afterEach(() => vi.restoreAllMocks());

  it('posts directly with the configured header', async () => {
    const result = await deliver(buildRefreshPayload('me'), SETTINGS, makeFetch(() => new Response('', { status: 200 })));
    expect(result).toEqual({ ok: true, route: 'direct', status: 200 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(SETTINGS.url);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(String(calls[0].init.body)).type).toBe('inbox-refresh');
  });

  it('falls back to /api/relay when the direct post fails (CORS)', async () => {
    const result = await deliver(
      buildRefreshPayload('me'),
      SETTINGS,
      makeFetch((url) => (url === SETTINGS.url ? new TypeError('Failed to fetch') : new Response('{"ok":true}', { status: 202 }))),
      'https://grokbot-inbox-x.vercel.app',
    );
    expect(result).toEqual({ ok: true, route: 'relay', status: 202 });
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toBe('https://grokbot-inbox-x.vercel.app/api/relay');
    const headers = calls[1].init.headers as Record<string, string>;
    expect(headers['X-Relay-Target']).toBe(SETTINGS.url);
    expect(headers['X-Relay-Header']).toBe('Authorization');
    expect(headers['X-Relay-Auth']).toBe('Bearer sk-test');
  });

  it('does not retry through the relay when the bot rejected the key', async () => {
    const result = await deliver(buildRefreshPayload('me'), SETTINGS, makeFetch(() => new Response('', { status: 401 })));
    expect(result.ok).toBe(false);
    expect(result.route).toBe('direct');
    expect(calls).toHaveLength(1);
  });

  it('skips the direct attempt when viaRelay is set', async () => {
    await deliver(buildRefreshPayload('me'), { ...SETTINGS, viaRelay: true }, makeFetch(() => new Response('{}', { status: 202 })));
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/relay');
  });

  it('explains a missing relay', async () => {
    const result = await deliver(buildRefreshPayload('me'), { ...SETTINGS, viaRelay: true }, makeFetch(() => new Response('', { status: 404 })));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no \/api\/relay/);
  });

  it('refuses to send when unconfigured', async () => {
    const result = await deliver(buildRefreshPayload('me'), { ...SETTINGS, key: '' }, makeFetch(() => new Response('')));
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
