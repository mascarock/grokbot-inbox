import { deflateSync, gunzipSync, inflateSync, strFromU8, strToU8, unzlibSync } from 'fflate';

/**
 * Viewer link format, documented in docs/LINK.md:
 *
 *   <viewer>#data=<base64url(deflate(utf8(json)))>
 *
 * The producer uses raw DEFLATE (RFC 1951). The decoder also accepts gzip
 * and zlib framing, detected from the first bytes. The payload lives in the
 * URL fragment, which browsers never send to the server.
 */
export const LINK_PARAM = 'data';

export class LinkDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinkDecodeError';
  }
}

export function encodeInboxPayload(json: string): string {
  return toBase64Url(deflateSync(strToU8(json), { level: 9 }));
}

export function decodeInboxPayload(payload: string): string {
  const bytes = fromBase64Url(payload);
  if (bytes.length === 0) throw new LinkDecodeError('This link has no inbox data in it.');
  try {
    return strFromU8(inflateAny(bytes));
  } catch (err) {
    if (err instanceof LinkDecodeError) throw err;
    throw new LinkDecodeError('This link does not contain a readable inbox export.');
  }
}

export function buildInboxLink(base: string, json: string): string {
  const url = new URL(base);
  url.hash = `${LINK_PARAM}=${encodeInboxPayload(json)}`;
  return url.toString();
}

/** Payload from a location hash such as "#data=…", or null. */
export function readLinkPayload(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const value = params.get(LINK_PARAM);
  return value && value.trim() ? value.trim() : null;
}

function inflateAny(bytes: Uint8Array): Uint8Array {
  if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) return gunzipSync(bytes);
  const header = ((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0);
  if (bytes.length > 2 && ((bytes[0] ?? 0) & 0x0f) === 8 && header % 31 === 0) return unzlibSync(bytes);
  return inflateSync(bytes);
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(payload: string): Uint8Array {
  const cleaned = payload.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
    throw new LinkDecodeError('This link is not a valid inbox link.');
  }
  const padded = cleaned.padEnd(Math.ceil(cleaned.length / 4) * 4, '=');
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new LinkDecodeError('This link is not a valid inbox link.');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
