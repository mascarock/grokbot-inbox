import type { InboxExport } from '../types/inbox';

/**
 * One way to obtain an inbox export.
 *
 * The thread UI depends only on {@link InboxExport}. v1 provides link
 * (`#data=`), file, URL, and sample sources. Anything else that can produce
 * an export implements this same interface and needs no renderer of its own.
 */
export interface InboxSource {
  /** Stable kind, for example "file", "url", "sample", or a future "remote". */
  readonly kind: string;
  /** Short label shown while loading and in the mailbox footer. */
  readonly label: string;
  load(): Promise<InboxExport>;
}
