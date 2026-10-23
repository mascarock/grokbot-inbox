import type { SnapshotEnvelope } from '../src/lib/crypto';

export function generateKey(): string;
export function encrypt(
  plaintext: string,
  keyB64: string,
  options?: { seq?: number; updatedAt?: string; compress?: boolean },
): Promise<SnapshotEnvelope>;
export function decrypt(envelope: SnapshotEnvelope, keyB64: string): Promise<string>;
