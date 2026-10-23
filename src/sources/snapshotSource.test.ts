import { describe, expect, it } from 'vitest';
import { encryptSnapshot, generateKeyB64 } from '../lib/crypto';
import { createSnapshotSource, isNewerSnapshot } from './snapshotSource';

const EXPORT = {
  inbox: 'me@mail.grokbot.com',
  exportedAt: '2026-10-23T10:00:00Z',
  relay: { webhookUrl: 'https://grok.com/routines/r/webhook' },
  threads: [{ id: 't1', subject: 'Hi', participants: [{ address: 'a@b.c' }], lastMessageAt: '2026-10-23T10:00:00Z', messages: [] }],
};

function fetchFor(files: Record<string, string>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.cache).toBe('no-store');
    const path = String(input);
    const body = files[path];
    return body === undefined ? new Response('not found', { status: 404 }) : new Response(body, { status: 200 });
  }) as typeof fetch;
}

describe('snapshot source', () => {
  it('fetches, decrypts, parses, and reports seq/updatedAt', async () => {
    const key = generateKeyB64();
    const envelope = await encryptSnapshot(JSON.stringify(EXPORT), key, { seq: 5, updatedAt: '2026-10-23T10:01:00Z' });
    const source = createSnapshotSource(key, fetchFor({ '/inbox.enc': JSON.stringify(envelope), '/inbox.meta.json': '{"seq":5,"updatedAt":"2026-10-23T10:01:00Z"}' }));
    const loaded = await source.loadSnapshot();
    expect(loaded.seq).toBe(5);
    expect(loaded.updatedAt).toBe('2026-10-23T10:01:00Z');
    expect(loaded.inbox.inbox).toBe('me@mail.grokbot.com');
    expect(loaded.inbox.threads).toHaveLength(1);
    expect(loaded.inbox.relay?.webhookUrl).toBe('https://grok.com/routines/r/webhook');
    expect(await source.peek()).toEqual({ seq: 5, updatedAt: '2026-10-23T10:01:00Z' });
  });

  it('explains a missing snapshot and tolerates a missing sidecar', async () => {
    const source = createSnapshotSource(generateKeyB64(), fetchFor({}));
    await expect(source.load()).rejects.toThrow(/No snapshot has been published/);
    expect(await source.peek()).toBeNull();
  });

  it('fails cleanly with the wrong key', async () => {
    const envelope = await encryptSnapshot(JSON.stringify(EXPORT), generateKeyB64(), { seq: 1 });
    const source = createSnapshotSource(generateKeyB64(), fetchFor({ '/inbox.enc': JSON.stringify(envelope) }));
    await expect(source.load()).rejects.toThrow(/does not open/);
  });
});

describe('isNewerSnapshot', () => {
  it('compares seq first, then updatedAt', () => {
    const current = { seq: 3, updatedAt: '2026-10-23T10:00:00Z' };
    expect(isNewerSnapshot(null, current)).toBe(true);
    expect(isNewerSnapshot(current, { seq: 4, updatedAt: '' })).toBe(true);
    expect(isNewerSnapshot(current, { seq: 2, updatedAt: '2027-01-01T00:00:00Z' })).toBe(false);
    expect(isNewerSnapshot(current, { seq: 3, updatedAt: '2026-10-23T10:00:00Z' })).toBe(false);
    expect(isNewerSnapshot(current, { seq: 3, updatedAt: '2026-10-23T10:05:00Z' })).toBe(true);
  });
});
