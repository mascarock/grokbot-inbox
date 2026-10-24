import { describe, expect, it } from 'vitest';
import {
  buildKeyLink,
  decryptOutboxItem,
  decryptSnapshot,
  deriveOutboxToken,
  encryptOutboxItem,
  encryptSnapshot,
  generateKeyB64,
  isValidKey,
  OUTBOX_AAD,
  parseEnvelope,
  parseOutboxEnvelope,
  parseSnapshotMeta,
  readKeyFragment,
  sha256Hex,
  SnapshotError,
} from './crypto';
// The bot-side scripts, exercised as the other end of each round trip.
import { decrypt as nodeDecrypt, encrypt as nodeEncrypt, generateKey as nodeGenerateKey } from '../../bot/encrypt_inbox.mjs';
import {
  decryptItem as botDecryptItem,
  deriveToken as botDeriveToken,
  encryptItem as botEncryptItem,
  sha256Hex as botSha256Hex,
} from '../../bot/outbox.mjs';

const SAMPLE = JSON.stringify({ inbox: 'me@mail.grokbot.com', exportedAt: '2026-10-23T10:00:00Z', threads: [{ id: 't1', subject: 'héllo ✓', participants: [], lastMessageAt: '2026-10-23T10:00:00Z', messages: [] }] });

describe('key handling', () => {
  it('generates valid 256-bit base64url keys', () => {
    const key = generateKeyB64();
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(isValidKey(key)).toBe(true);
    expect(isValidKey(key.slice(1))).toBe(false);
    expect(isValidKey('not+base64url/')).toBe(false);
  });

  it('reads #k= fragments and ignores other fragments', () => {
    const key = generateKeyB64();
    expect(readKeyFragment(`#k=${key}`)).toBe(key);
    expect(readKeyFragment(`k=${key}`)).toBe(key);
    expect(readKeyFragment('#data=abc')).toBeNull();
    expect(readKeyFragment('#k=short')).toBeNull();
    expect(readKeyFragment('')).toBeNull();
  });

  it('builds links with the key only in the fragment', () => {
    const key = generateKeyB64();
    const link = buildKeyLink('https://grokbot-inbox-x.vercel.app', key);
    expect(link).toBe(`https://grokbot-inbox-x.vercel.app/#k=${key}`);
    expect(new URL(link).search).toBe('');
  });
});

describe('viewer encrypt/decrypt', () => {
  it('round-trips with compression and without', async () => {
    const key = generateKeyB64();
    for (const compress of [true, false]) {
      const envelope = await encryptSnapshot(SAMPLE, key, { seq: 7, compress });
      expect(envelope.v).toBe(1);
      expect(envelope.alg).toBe('A256GCM');
      expect(envelope.seq).toBe(7);
      expect(envelope.cmp).toBe(compress ? 'deflate-raw' : undefined);
      expect(await decryptSnapshot(parseEnvelope(JSON.parse(JSON.stringify(envelope))), key)).toBe(SAMPLE);
    }
  });

  it('uses a fresh IV per snapshot', async () => {
    const key = generateKeyB64();
    const a = await encryptSnapshot(SAMPLE, key, { seq: 1 });
    const b = await encryptSnapshot(SAMPLE, key, { seq: 2 });
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it('rejects the wrong key and tampered ciphertext', async () => {
    const key = generateKeyB64();
    const envelope = await encryptSnapshot(SAMPLE, key, { seq: 1 });
    await expect(decryptSnapshot(envelope, generateKeyB64())).rejects.toBeInstanceOf(SnapshotError);
    const flipped = envelope.ct[0] === 'A' ? 'B' : 'A';
    await expect(decryptSnapshot({ ...envelope, ct: flipped + envelope.ct.slice(1) }, key)).rejects.toBeInstanceOf(SnapshotError);
  });

  it('refuses unknown envelope versions, algorithms, and compression', () => {
    expect(() => parseEnvelope({ v: 2, alg: 'A256GCM', iv: 'a', ct: 'b' })).toThrow(SnapshotError);
    expect(() => parseEnvelope({ v: 1, alg: 'XCHACHA', iv: 'a', ct: 'b' })).toThrow(SnapshotError);
    expect(() => parseEnvelope({ v: 1, alg: 'A256GCM', iv: 'a', ct: 'b', cmp: 'br' })).toThrow(SnapshotError);
    expect(() => parseEnvelope('nope')).toThrow(SnapshotError);
    expect(parseEnvelope({ v: 1, alg: 'A256GCM', iv: 'a', ct: 'b' }).seq).toBe(0);
  });
});

describe('bot script → viewer round trip', () => {
  it('decrypts what bot/encrypt_inbox.mjs produced', async () => {
    const key = nodeGenerateKey() as string;
    expect(isValidKey(key)).toBe(true);
    for (const compress of [true, false]) {
      const envelope = await nodeEncrypt(SAMPLE, key, { seq: 42, updatedAt: '2026-10-23T10:05:00.000Z', compress });
      const parsed = parseEnvelope(JSON.parse(JSON.stringify(envelope)));
      expect(parsed.seq).toBe(42);
      expect(parsed.updatedAt).toBe('2026-10-23T10:05:00.000Z');
      expect(await decryptSnapshot(parsed, key)).toBe(SAMPLE);
    }
  });

  it('and the bot script decrypts what the viewer produced', async () => {
    const key = generateKeyB64();
    const envelope = await encryptSnapshot(SAMPLE, key, { seq: 3 });
    expect(await nodeDecrypt(envelope, key)).toBe(SAMPLE);
  });
});

const ITEM = JSON.stringify({ type: 'inbox-send', v: 1, from: 'me@mail.grokbot.com', subject: 'Re: héllo', body: 'ok ✓' });

describe('outbox envelopes', () => {
  it('round-trips and is bound to the outbox AAD', async () => {
    const key = generateKeyB64();
    const envelope = await encryptOutboxItem(ITEM, key);
    expect(envelope).toEqual({ v: 1, alg: 'A256GCM', iv: expect.stringMatching(/^[A-Za-z0-9_-]{16}$/), ct: expect.any(String) });
    expect(await decryptOutboxItem(parseOutboxEnvelope(JSON.parse(JSON.stringify(envelope))), key)).toBe(ITEM);
    // A snapshot ciphertext (no AAD) must not open as an outbox item, and vice versa.
    const snapshot = await encryptSnapshot(ITEM, key, { seq: 1, compress: false });
    await expect(decryptOutboxItem({ v: 1, alg: 'A256GCM', iv: snapshot.iv, ct: snapshot.ct }, key)).rejects.toBeInstanceOf(SnapshotError);
    await expect(decryptSnapshot({ ...envelope, seq: 1, updatedAt: '' }, key)).rejects.toBeInstanceOf(SnapshotError);
    await expect(decryptOutboxItem(envelope, generateKeyB64())).rejects.toBeInstanceOf(SnapshotError);
    expect(OUTBOX_AAD).toBe('grokbot-inbox/outbox/v1');
  });

  it('parses only well-formed envelopes', () => {
    expect(() => parseOutboxEnvelope({ v: 1, alg: 'A256GCM', iv: 'a' })).toThrow(SnapshotError);
    expect(() => parseOutboxEnvelope({ v: 1, alg: 'none', iv: 'a', ct: 'b' })).toThrow(SnapshotError);
    expect(() => parseOutboxEnvelope([])).toThrow(SnapshotError);
    expect(parseOutboxEnvelope({ v: 1, alg: 'A256GCM', iv: 'a', ct: 'b', extra: true })).toEqual({ v: 1, alg: 'A256GCM', iv: 'a', ct: 'b' });
  });

  it('derives a deterministic token the bot computes identically', async () => {
    const key = generateKeyB64();
    const token = await deriveOutboxToken(key);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await deriveOutboxToken(key)).toBe(token);
    expect(await deriveOutboxToken(generateKeyB64())).not.toBe(token);
    expect(await botDeriveToken(key)).toBe(token);
    expect(await sha256Hex(token)).toBe(botSha256Hex(token));
    expect(await sha256Hex(token)).toMatch(/^[0-9a-f]{64}$/);
    await expect(deriveOutboxToken('short')).rejects.toBeInstanceOf(SnapshotError);
  });

  it('interoperates with bot/outbox.mjs in both directions', async () => {
    const key = nodeGenerateKey() as string;
    const fromViewer = await encryptOutboxItem(ITEM, key);
    expect(await botDecryptItem(fromViewer, key)).toBe(ITEM);
    const fromBot = await botEncryptItem(ITEM, key);
    expect(await decryptOutboxItem(parseOutboxEnvelope(fromBot), key)).toBe(ITEM);
  });

  it('reads the outbox flags from inbox.meta.json', () => {
    expect(parseSnapshotMeta({ seq: 1, updatedAt: 'x' })).toEqual({ seq: 1, updatedAt: 'x' });
    expect(parseSnapshotMeta({ seq: 1, updatedAt: 'x', outbox: true, outboxAcked: ['outbox/a.enc', 7, 'outbox/b.enc'] })).toEqual({
      seq: 1,
      updatedAt: 'x',
      outbox: true,
      outboxAcked: ['outbox/a.enc', 'outbox/b.enc'],
    });
    expect(parseSnapshotMeta({ seq: 1, outbox: 'yes' })?.outbox).toBeUndefined();
  });
});
