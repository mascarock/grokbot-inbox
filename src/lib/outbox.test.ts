import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptItem as botDecryptItem, deriveToken as botDeriveToken } from '../../bot/outbox.mjs';
import { generateKeyB64, type OutboxEnvelope } from './crypto';
import {
  chooseDelivery,
  deliverPayload,
  enqueue,
  loadQueue,
  OUTBOX_PATH,
  postToOutbox,
  probeOutbox,
  reconcileQueue,
  saveQueue,
  summarizePayload,
  type QueuedItem,
} from './outbox';
import { buildActionPayload, buildRefreshPayload, buildSendPayload, EMPTY_SETTINGS, type WebhookSettings } from './webhook';

const KEY = generateKeyB64();
const WEBHOOK: WebhookSettings = { ...EMPTY_SETTINGS, url: 'https://grok.com/routines/r/webhook', key: 'sender-key' };
const PAYLOAD = buildSendPayload(
  { from: 'me@mail.grokbot.com', kind: 'reply', thread: 'th-1', inReplyTo: 'm-1', to: [{ address: 'alice@example.com' }], cc: [], subject: 'Re: hi', body: 'ok' },
  '/inbox-send v1\nfrom: me@mail.grokbot.com\nto: alice@example.com\nsubject: Re: hi\n---\nok',
  new Date('2026-10-23T14:06:00Z'),
);

type Call = { url: string; init: RequestInit };

function fetchRouter(routes: Record<string, (init: RequestInit) => Response | Promise<Response>>) {
  const calls: Call[] = [];
  const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    const key = `${(init?.method ?? 'GET').toUpperCase()} ${url}`;
    const route = routes[key] ?? routes[url];
    if (!route) throw new TypeError('Failed to fetch');
    return route(init ?? {});
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

describe('probeOutbox', () => {
  it('is true only for a 204', async () => {
    for (const [status, expected] of [
      [204, true],
      [503, false],
      [404, false],
    ] as const) {
      const { fetchFn } = fetchRouter({ [`HEAD ${OUTBOX_PATH}`]: () => new Response(null, { status }) });
      expect(await probeOutbox(fetchFn)).toBe(expected);
    }
    const { fetchFn } = fetchRouter({});
    expect(await probeOutbox(fetchFn)).toBe(false);
  });
});

describe('postToOutbox', () => {
  it('posts an envelope the bot can decrypt, with the derived bearer token', async () => {
    const { fetchFn, calls } = fetchRouter({ [`POST ${OUTBOX_PATH}`]: () => Response.json({ id: 'outbox/x.enc' }, { status: 201 }) });
    const result = await postToOutbox(PAYLOAD, KEY, fetchFn);
    expect(result).toEqual({ ok: true, id: 'outbox/x.enc', status: 201 });
    const { init } = calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${await botDeriveToken(KEY)}`);
    const body = JSON.parse(String(init.body)) as OutboxEnvelope;
    expect(body.v).toBe(1);
    expect(String(init.body)).not.toContain('alice@example.com');
    expect(JSON.parse(await botDecryptItem(body, KEY))).toEqual(PAYLOAD);
  });

  it('explains the usual failures', async () => {
    for (const [status, fragment] of [
      [404, 'older deployment'],
      [503, 'not set up'],
      [401, 'fresh link'],
      [429, 'Too many'],
      [413, 'too large'],
      [502, 'storage call failed'],
    ] as const) {
      const { fetchFn } = fetchRouter({ [`POST ${OUTBOX_PATH}`]: () => Response.json({ error: 'The storage call failed.' }, { status }) });
      const result = await postToOutbox(PAYLOAD, KEY, fetchFn);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(status);
      expect(result.error).toContain(fragment);
    }
    const { fetchFn } = fetchRouter({});
    expect((await postToOutbox(PAYLOAD, KEY, fetchFn)).error).toContain('Could not reach');
  });
});

describe('delivery order', () => {
  it('chooses webhook, then outbox, then copy', () => {
    expect(chooseDelivery({ webhook: WEBHOOK, outboxKey: KEY, outboxReady: true })).toBe('webhook');
    expect(chooseDelivery({ webhook: EMPTY_SETTINGS, outboxKey: KEY, outboxReady: true })).toBe('outbox');
    expect(chooseDelivery({ webhook: EMPTY_SETTINGS, outboxKey: KEY, outboxReady: false })).toBe('copy');
    expect(chooseDelivery({ webhook: EMPTY_SETTINGS, outboxKey: null, outboxReady: true })).toBe('copy');
  });

  it('uses the webhook when it works and never touches the outbox', async () => {
    const { fetchFn, calls } = fetchRouter({
      [`POST ${WEBHOOK.url}`]: () => new Response('', { status: 200 }),
      [`POST ${OUTBOX_PATH}`]: () => Response.json({ id: 'outbox/x.enc' }, { status: 201 }),
    });
    const outcome = await deliverPayload(PAYLOAD, { webhook: WEBHOOK, outboxKey: KEY, outboxReady: true }, fetchFn);
    expect(outcome).toEqual({ ok: true, via: 'webhook', status: 200 });
    expect(calls.map((c) => c.url)).toEqual([WEBHOOK.url]);
  });

  it('falls back to the outbox when the webhook and the relay both fail', async () => {
    const { fetchFn, calls } = fetchRouter({
      [`POST /api/relay`]: () => Response.json({ error: 'Could not reach the bot.' }, { status: 504 }),
      [`POST ${OUTBOX_PATH}`]: () => Response.json({ id: 'outbox/y.enc' }, { status: 201 }),
    });
    const outcome = await deliverPayload(PAYLOAD, { webhook: WEBHOOK, outboxKey: KEY, outboxReady: true }, fetchFn);
    expect(outcome.ok).toBe(true);
    expect(outcome.via).toBe('outbox');
    expect(outcome.id).toBe('outbox/y.enc');
    expect(outcome.webhookError).toContain('Could not reach the bot');
    expect(calls.map((c) => c.url)).toEqual([WEBHOOK.url, '/api/relay', OUTBOX_PATH]);
  });

  it('reports the webhook failure when there is no outbox to fall back to', async () => {
    const { fetchFn } = fetchRouter({ [`POST ${WEBHOOK.url}`]: () => new Response('', { status: 401 }) });
    const outcome = await deliverPayload(PAYLOAD, { webhook: WEBHOOK, outboxKey: KEY, outboxReady: false }, fetchFn);
    expect(outcome).toEqual({ ok: false, via: 'webhook', status: 401, error: 'The bot rejected the key.' });
  });

  it('goes straight to the outbox without a webhook, and reports its errors', async () => {
    const up = fetchRouter({ [`POST ${OUTBOX_PATH}`]: () => Response.json({ id: 'outbox/z.enc' }, { status: 201 }) });
    let outcome = await deliverPayload(PAYLOAD, { webhook: EMPTY_SETTINGS, outboxKey: KEY, outboxReady: true }, up.fetchFn);
    expect(outcome).toEqual({ ok: true, via: 'outbox', id: 'outbox/z.enc', status: 201, webhookError: undefined });
    expect(up.calls.map((c) => c.url)).toEqual([OUTBOX_PATH]);

    const down = fetchRouter({ [`POST ${OUTBOX_PATH}`]: () => Response.json({ error: 'x' }, { status: 503 }) });
    outcome = await deliverPayload(PAYLOAD, { webhook: EMPTY_SETTINGS, outboxKey: KEY, outboxReady: true }, down.fetchFn);
    expect(outcome.ok).toBe(false);
    expect(outcome.via).toBe('outbox');
    expect(outcome.error).toContain('not set up');
  });

  it('has nothing to do without webhook or outbox', async () => {
    const { fetchFn, calls } = fetchRouter({});
    const outcome = await deliverPayload(PAYLOAD, { webhook: EMPTY_SETTINGS, outboxKey: null, outboxReady: false }, fetchFn);
    expect(outcome.ok).toBe(false);
    expect(outcome.via).toBe('copy');
    expect(calls).toHaveLength(0);
  });
});

describe('local queue', () => {
  beforeEach(() => localStorage.clear());

  it('summarizes payloads for the list', () => {
    expect(summarizePayload(PAYLOAD)).toBe('Reply: Re: hi');
    expect(summarizePayload({ ...PAYLOAD, kind: 'forward', subject: '' })).toBe('Forward: (no subject)');
    expect(summarizePayload(buildRefreshPayload('me@x.com'))).toBe('Refresh request');
    expect(summarizePayload(buildActionPayload('me@x.com', 'archive', 'th-1'))).toBe('Archive thread');
  });

  it('enqueues once per id, persists per inbox, and reconciles against acked ids', () => {
    const now = new Date('2026-10-23T14:06:00Z');
    let queue = enqueue([], PAYLOAD, 'outbox/a.enc', now);
    queue = enqueue(queue, PAYLOAD, 'outbox/a.enc', now);
    queue = enqueue(queue, { ...PAYLOAD, subject: 'two' }, 'outbox/b.enc', now);
    expect(queue.map((q) => q.id)).toEqual(['outbox/a.enc', 'outbox/b.enc']);
    expect(queue[0]).toEqual<QueuedItem>({ id: 'outbox/a.enc', type: 'inbox-send', summary: 'Reply: Re: hi', queuedAt: now.toISOString() });

    saveQueue('me@x.com', queue);
    expect(loadQueue('me@x.com')).toEqual(queue);
    expect(loadQueue('other@x.com')).toEqual([]);

    const { queue: left, handled } = reconcileQueue(queue, ['outbox/a.enc', 'outbox/unknown.enc']);
    expect(handled.map((q) => q.id)).toEqual(['outbox/a.enc']);
    expect(left.map((q) => q.id)).toEqual(['outbox/b.enc']);
    expect(reconcileQueue(queue, [])).toEqual({ queue, handled: [] });

    saveQueue('me@x.com', []);
    expect(localStorage.getItem('grokbot-inbox-outbox:me@x.com')).toBeNull();
  });

  it('ignores garbage in storage', () => {
    localStorage.setItem('grokbot-inbox-outbox:me@x.com', '{"not":"a list"}');
    expect(loadQueue('me@x.com')).toEqual([]);
    localStorage.setItem('grokbot-inbox-outbox:me@x.com', '[1, {"id":"outbox/a.enc","summary":"x","type":"inbox-send","queuedAt":"t"}]');
    expect(loadQueue('me@x.com')).toHaveLength(1);
  });
});
