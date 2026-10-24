import type { OutboxEnvelope } from '../src/lib/crypto';

export const OUTBOX_AAD: string;
export const OUTBOX_TOKEN_INFO: string;
export const OUTBOX_PATH: string;

export interface PulledItem {
  id: string;
  at: string;
  payload?: Record<string, unknown>;
  error?: string;
}

export function deriveToken(keyB64: string): Promise<string>;
export function sha256Hex(text: string): string;
export function encryptItem(plaintext: string, keyB64: string): Promise<OutboxEnvelope>;
export function decryptItem(envelope: OutboxEnvelope, keyB64: string): Promise<string>;
export function validatePayload(input: unknown): { ok: true; payload: Record<string, unknown> } | { ok: false; reason: string };
export function pull(base: string, keyB64: string, fetchFn?: typeof fetch): Promise<{ items: PulledItem[]; hasMore: boolean }>;
export function ack(base: string, keyB64: string, ids: string[], fetchFn?: typeof fetch): Promise<{ id: string; ok: boolean; status: number; error?: string }[]>;
