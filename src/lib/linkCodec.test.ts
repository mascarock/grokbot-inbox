import { deflateSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildInboxLink, decodeInboxPayload, encodeInboxPayload, LinkDecodeError, readLinkPayload } from './linkCodec';

const json = JSON.stringify({ inbox: 'demo+roma@mail.grokbot.com', threads: [], note: 'çà — ünïcode ✓' });

function b64url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

describe('link codec', () => {
  it('round-trips raw deflate + base64url', () => {
    const payload = encodeInboxPayload(json);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeInboxPayload(payload)).toBe(json);
  });

  it('accepts zlib and gzip framed payloads and whitespace-wrapped links', () => {
    expect(decodeInboxPayload(b64url(deflateSync(Buffer.from(json))))).toBe(json);
    expect(decodeInboxPayload(b64url(gzipSync(Buffer.from(json))))).toBe(json);
    const wrapped = encodeInboxPayload(json).replace(/(.{20})/g, '$1\n');
    expect(decodeInboxPayload(wrapped)).toBe(json);
  });

  it('builds a fragment link and reads it back', () => {
    const link = buildInboxLink('https://grok-bot-inbox.vercel.app/', json);
    const url = new URL(link);
    expect(url.search).toBe('');
    expect(url.hash.startsWith('#data=')).toBe(true);
    expect(decodeInboxPayload(readLinkPayload(url.hash) ?? '')).toBe(json);
  });

  it('ignores hashes without data and rejects garbage', () => {
    expect(readLinkPayload('')).toBeNull();
    expect(readLinkPayload('#section')).toBeNull();
    expect(readLinkPayload('#data=')).toBeNull();
    expect(() => decodeInboxPayload('%%%')).toThrow(LinkDecodeError);
    expect(() => decodeInboxPayload('aGVsbG8gd29ybGQ')).toThrow(LinkDecodeError);
  });
});
