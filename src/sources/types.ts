import type { InboxExport } from '../types/inbox';

/**
 * One way to obtain an inbox export.
 *
 * The thread UI depends only on {@link InboxExport}. v1 provides file, URL,
 * and sample sources. A future signed-in backend implements this same
 * interface (see docs/ROADMAP.md) and does not need its own renderer.
 */
export interface InboxSource {
  /** Stable kind, for example "file", "url", "sample", or a future "remote". */
  readonly kind: string;
  /** Short label shown while loading and in the mailbox footer. */
  readonly label: string;
  load(): Promise<InboxExport>;
}
