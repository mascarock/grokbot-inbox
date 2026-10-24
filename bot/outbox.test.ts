import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { deriveOutboxToken, encryptOutboxItem, generateKeyB64, sha256Hex } from '../src/lib/crypto';
import { buildSendPayload } from '../src/lib/webhook';
import { ack, pull, validatePayload } from './outbox.mjs';

const root = resolve(__dirname, '..');
const mjs = resolve(root, 'bot/outbox.mjs');
const dir = mkdtempSync(join(tmpdir(), 'outbox-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const KEY = generateKeyB64();
const BASE = 'https://grokbot-inbox-x.vercel.app';
const SEND = buildSendPayload(
  { from: 'me@mail.grokbot.com', kind: 'reply', thread: 'th-1', inReplyTo: 'm-1', to: [{ name: 'Alice', address: 'alice@example.com' }], cc: [], subject: 'Re: hi', body: 'ok' },
  '/inbox-send v1\nfrom: me@mail.grokbot.com\nto: Alice <alice@example.com>\nsubject: Re: hi\n---\nok',
  new Date('2026-10-23T14:06:00Z'),
);

function run(args: string[]) {
  const result = spawnSync('node', [mjs, ...args], { encoding: 'utf8', cwd: dir });
  if (result.error) throw result.error;
  return { stdout: result.stdout, stderr: result.stderr, status: result.status ?? 1 };
}

describe('bot/outbox.mjs token', () => {
  const keyFile = join(dir, 'x.key');
  writeFileSync(keyFile, `${KEY}\n`, { mode: 0o600 });

  it('prints sha256(token) matching what the viewer derives, and never the key or token', async () => {
    const result = run(['token', '--key-file', keyFile]);
    expect(result.status, result.stderr).toBe(0);
    const token = await deriveOutboxToken(KEY);
    expect(result.stdout.trim()).toBe(await sha256Hex(token));
    expect(result.stdout).not.toContain(KEY);
    expect(result.stdout).not.toContain(token);
  });

  it('accepts --key as a path or a raw key and rejects short keys', () => {
    expect(run(['token', '--key', keyFile]).stdout).toBe(run(['token', '--key', KEY]).stdout);
    expect(run(['token', '--key', 'c2hvcnQ']).status).toBe(1);
    expect(run(['token']).status).toBe(1);
    expect(run(['nonsense']).status).toBe(2);
  });
});

describe('validatePayload', () => {
  it('accepts the three payload types with sane fields', () => {
    expect(validatePayload(SEND)).toEqual({ ok: true, payload: SEND });
    expect(validatePayload({ type: 'inbox-refresh', v: 1, inbox: 'me@mail.grokbot.com', sentAt: '2026-10-23T14:06:00Z' }).ok).toBe(true);
    expect(validatePayload({ type: 'inbox-action', v: 1, inbox: 'me@mail.grokbot.com', action: 'archive', threadId: 'th-1', sentAt: '2026-10-23T14:06:00Z' }).ok).toBe(true);
  });

  it('rejects the rest with a reason', () => {
    const bad = (input: unknown) => {
      const result = validatePayload(input);
      expect(result.ok).toBe(false);
      return result.ok ? '' : result.reason;
    };
    expect(bad(null)).toContain('object');
    expect(bad({ ...SEND, v: 2 })).toContain('version');
    expect(bad({ ...SEND, type: 'inbox-delete' })).toContain('type');
    expect(bad({ ...SEND, from: 'not an address' })).toContain('from');
    expect(bad({ ...SEND, kind: 'bcc' })).toContain('kind');
    expect(bad({ ...SEND, to: [] })).toContain('to');
    expect(bad({ ...SEND, to: [{ address: 'alice@example.com', name: 'Evil\r\nBcc: x@y.z' }] })).toContain('to');
    expect(bad({ ...SEND, cc: [{ address: 'nope' }] })).toContain('cc');
    expect(bad({ ...SEND, subject: 'a\nb' })).toContain('subject');
    expect(bad({ ...SEND, body: '  ' })).toContain('body');
    expect(bad({ ...SEND, command: 'rm -rf' })).toContain('command');
    expect(bad({ ...SEND, threadId: 'a\nb' })).toContain('threadId');
    expect(bad({ ...SEND, sentAt: 'yesterday' })).toContain('sentAt');
    expect(bad({ type: 'inbox-action', v: 1, inbox: 'me@mail.grokbot.com', action: 'delete', threadId: 'th', sentAt: '2026-10-23T14:06:00Z' })).toContain('action');
    expect(bad({ type: 'inbox-refresh', v: 1, inbox: 'x', sentAt: '2026-10-23T14:06:00Z' })).toContain('inbox');
  });
});

describe('pull and ack against a fake /api/outbox', () => {
  function fakeApi(items: { id: string; at: string; envelope: unknown }[]) {
    const deleted: string[] = [];
    const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const auth = (init?.headers as Record<string, string>)?.authorization ?? '';
      expect(url.pathname).toBe('/api/outbox');
      if (auth !== `Bearer ${await deriveOutboxToken(KEY)}`) return Response.json({ error: 'nope' }, { status: 401 });
      if ((init?.method ?? 'GET') === 'GET') return Response.json({ items, hasMore: false });
      if (init?.method === 'DELETE') {
        const id = url.searchParams.get('id') ?? '';
        if (!items.some((i) => i.id === id)) return Response.json({ error: 'No such item.' }, { status: 404 });
        deleted.push(id);
        return Response.json({ ok: true, id });
      }
      return new Response('', { status: 405 });
    }) as unknown as typeof fetch;
    return { fetchFn, deleted };
  }

  it('decrypts and validates each item, reporting the ones it cannot use', async () => {
    const good = await encryptOutboxItem(JSON.stringify(SEND), KEY);
    const wrongKey = await encryptOutboxItem(JSON.stringify(SEND), generateKeyB64());
    const badShape = await encryptOutboxItem(JSON.stringify({ type: 'inbox-send', v: 1 }), KEY);
    const notJson = await encryptOutboxItem('hello', KEY);
    const { fetchFn } = fakeApi([
      { id: 'outbox/1.enc', at: '2026-10-23T14:06:00.000Z', envelope: good },
      { id: 'outbox/2.enc', at: '', envelope: wrongKey },
      { id: 'outbox/3.enc', at: '', envelope: badShape },
      { id: 'outbox/4.enc', at: '', envelope: notJson },
    ]);
    const { items, hasMore } = await pull(BASE, KEY, fetchFn);
    expect(hasMore).toBe(false);
    expect(items[0]).toEqual({ id: 'outbox/1.enc', at: '2026-10-23T14:06:00.000Z', payload: SEND });
    expect(items[1].error).toContain('key does not open');
    expect(items[2].error).toContain('sentAt');
    expect(items[3].error).toBeTruthy();
    expect(items.map((i) => 'payload' in i)).toEqual([true, false, false, false]);
  });

  it('acks by id, treating 404 as already gone, and explains 401/503', async () => {
    const good = await encryptOutboxItem(JSON.stringify(SEND), KEY);
    const { fetchFn, deleted } = fakeApi([{ id: 'outbox/1.enc', at: '', envelope: good }]);
    const results = await ack(BASE, KEY, ['outbox/1.enc', 'outbox/gone.enc'], fetchFn);
    expect(results.map((r) => r.ok)).toEqual([true, true]);
    expect(results.map((r) => r.status)).toEqual([200, 404]);
    expect(deleted).toEqual(['outbox/1.enc']);

    await expect(pull(BASE, generateKeyB64(), fetchFn)).rejects.toThrow(/401/);
    const down = vi.fn(async () => Response.json({ error: 'The outbox is not set up on this project.' }, { status: 503 })) as unknown as typeof fetch;
    await expect(pull(BASE, KEY, down)).rejects.toThrow(/503.*not set up/);
  });
});
