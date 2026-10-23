import { describe, expect, it } from 'vitest';
import {
  buildKeyLink,
  decryptSnapshot,
  encryptSnapshot,
  generateKeyB64,
  isValidKey,
  parseEnvelope,
  readKeyFragment,
  SnapshotError,
} from './crypto';
// The bot-side script, exercised as the producer in the round trip.
import { decrypt as nodeDecrypt, encrypt as nodeEncrypt, generateKey as nodeGenerateKey } from '../../bot/encrypt_inbox.mjs';

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
