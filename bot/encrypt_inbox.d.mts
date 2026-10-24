import type { SnapshotEnvelope } from '../src/lib/crypto';

export function generateKey(): string;
export function encrypt(
  plaintext: string,
  keyB64: string,
  options?: { seq?: number; updatedAt?: string; compress?: boolean },
): Promise<SnapshotEnvelope>;
export function decrypt(envelope: SnapshotEnvelope, keyB64: string): Promise<string>;
export function buildMeta(
  seq: number,
  updatedAt: string,
  args?: { outbox?: boolean | string; acked?: string | string[] | boolean },
): { seq: number; updatedAt: string; outbox?: true; outboxAcked?: string[] };
