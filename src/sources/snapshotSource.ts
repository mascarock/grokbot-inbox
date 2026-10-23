import {
  SnapshotError,
  decryptSnapshot,
  parseEnvelope,
  parseSnapshotMeta,
  type SnapshotEnvelope,
  type SnapshotMeta,
} from '../lib/crypto';
import { parseExportText } from './parseExport';
import type { InboxExport } from '../types/inbox';
import type { InboxSource } from './types';

export const SNAPSHOT_PATH = '/inbox.enc';
export const SNAPSHOT_META_PATH = '/inbox.meta.json';

export interface SnapshotLoad {
  inbox: InboxExport;
  seq: number;
  updatedAt: string;
}

/**
 * Encrypted snapshot on the viewer's own origin, opened with the key from
 * `#k=`. The server only ever sees ciphertext; the key is in the fragment
 * and in this device's localStorage.
 */
export function createSnapshotSource(keyB64: string, fetchFn: typeof fetch = fetch, origin = ''): InboxSource & {
  loadSnapshot(): Promise<SnapshotLoad>;
  peek(): Promise<SnapshotMeta | null>;
} {
  async function fetchEnvelope(): Promise<SnapshotEnvelope> {
    let res: Response;
    try {
      res = await fetchFn(`${origin}${SNAPSHOT_PATH}`, { cache: 'no-store' });
    } catch {
      throw new SnapshotError('Could not reach this inbox. Check your connection and try again.');
    }
    if (res.status === 404) {
      throw new SnapshotError('No snapshot has been published here yet. Your bot publishes one on the next new mail, or ask it to "publish my inbox".');
    }
    if (!res.ok) throw new SnapshotError(`The snapshot could not be fetched (${res.status}).`);
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new SnapshotError('The snapshot is not valid JSON.');
    }
    return parseEnvelope(json);
  }

  return {
    kind: 'snapshot',
    label: 'Encrypted snapshot from your bot',
    async load() {
      return (await this.loadSnapshot()).inbox;
    },
    async loadSnapshot() {
      const envelope = await fetchEnvelope();
      const text = await decryptSnapshot(envelope, keyB64);
      const inbox = parseExportText(text);
      return { inbox, seq: envelope.seq, updatedAt: envelope.updatedAt || inbox.exportedAt };
    },
    /** Cheap check: the sidecar is a few bytes. Returns null when it does not exist. */
    async peek() {
      try {
        const res = await fetchFn(`${origin}${SNAPSHOT_META_PATH}`, { cache: 'no-store' });
        if (!res.ok) return null;
        return parseSnapshotMeta(await res.json());
      } catch {
        return null;
      }
    },
  };
}

/**
 * Applies a fresh snapshot without disturbing what the user is doing. Local
 * read/star/archive state is keyed by thread id in localStorage, so it
 * survives on its own; this keeps the selected thread when it still exists.
 */
export function isNewerSnapshot(current: { seq: number; updatedAt: string } | null, next: SnapshotMeta): boolean {
  if (!current) return true;
  if (next.seq !== current.seq) return next.seq > current.seq;
  return Boolean(next.updatedAt) && next.updatedAt > current.updatedAt;
}
