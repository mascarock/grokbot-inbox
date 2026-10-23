/**
 * Normalized Grok Bot inbox export.
 *
 * Producers should follow schema/inbox.schema.json. The viewer also accepts
 * missing optional fields and unknown extra fields. Extras are dropped while
 * parsing, and missing lists become empty arrays. See docs/SCHEMA.md.
 */

export type Direction = 'sent' | 'received';

export interface Participant {
  name?: string;
  address: string;
}

export interface Attachment {
  filename: string;
  contentType: string;
  /** Size in bytes. May be approximate. */
  size: number;
  sizeDisplay?: string;
  /** True for inline parts such as signature images. Hidden in the UI by default. */
  inline?: boolean;
  attachmentId?: string;
  /** Set only when the export includes a way to open the bytes. */
  url?: string;
}

export interface Message {
  id: string;
  direction?: Direction;
  from: Participant;
  to: Participant[];
  cc?: Participant[];
  /** ISO-8601. Displayed in the viewer's local time zone. */
  date: string;
  subject: string;
  text?: string;
  html?: string;
  attachments: Attachment[];
}

export interface Thread {
  id: string;
  subject: string;
  participants: Participant[];
  /** ISO-8601. */
  lastMessageAt: string;
  /**
   * Declared total. May be larger than `messages.length` when the export
   * does not include every message.
   */
  messageCount?: number;
  messages: Message[];
}

/**
 * `lite` exports leave out quoted replies, HTML bodies, inline images, and
 * attachment bytes so the export fits in a viewer link. See docs/LINK.md.
 */
export type ExportMode = 'full' | 'lite';

export interface InboxExport {
  inbox: string;
  /** ISO-8601 timestamp of the export. Empty if the file omitted it. */
  exportedAt: string;
  threads: Thread[];
  /** Omitted means full. */
  mode?: ExportMode;
  /** Exporter metadata. The viewer does not require a particular shape. */
  source?: Record<string, unknown>;
}
