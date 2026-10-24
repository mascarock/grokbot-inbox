import type { Attachment, Direction, InboxExport, Message, Participant, Thread } from '../types/inbox';

export class ExportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportParseError';
  }
}

/** Text size cap so a huge drop cannot freeze the tab. */
export const MAX_EXPORT_CHARS = 25_000_000;

/**
 * Parse an export from text. Recovers a JSON object wrapped in a Markdown
 * fence or preceded by a short note, which is what a bot often returns.
 */
export function parseExportText(text: string): InboxExport {
  if (text.length > MAX_EXPORT_CHARS) {
    throw new ExportParseError('That export is too large to open in the browser (limit is 25 MB of text).');
  }
  let data: unknown;
  try {
    data = JSON.parse(extractJson(text));
  } catch {
    throw new ExportParseError('That file is not valid JSON.');
  }
  return parseInboxExport(data);
}

export function parseInboxExport(input: unknown): InboxExport {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ExportParseError('Inbox export must be a JSON object.');
  }
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.threads)) {
    throw new ExportParseError(
      'This JSON is not an inbox export. Expected an object with a "threads" array.',
    );
  }

  const inbox = typeof raw.inbox === 'string' && raw.inbox.trim() ? raw.inbox.trim() : 'Unknown inbox';
  const exportedAt = typeof raw.exportedAt === 'string' ? raw.exportedAt : '';
  const seenThreadIds = new Set<string>();
  const threads = raw.threads
    .map((entry, index) => parseThread(entry, index, seenThreadIds))
    .filter((thread): thread is Thread => thread !== null)
    .sort(compareThreadsDesc);

  const result: InboxExport = { inbox, exportedAt, threads };
  if (typeof raw.mode === 'string') {
    const mode = raw.mode.trim().toLowerCase();
    if (mode === 'lite' || mode === 'full') result.mode = mode;
  }
  if (raw.source && typeof raw.source === 'object' && !Array.isArray(raw.source)) {
    result.source = raw.source as Record<string, unknown>;
  }
  const relay = parseRelayPrefill(raw.relay);
  if (relay) result.relay = relay;
  return result;
}

function parseRelayPrefill(input: unknown): InboxExport['relay'] | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const out: NonNullable<InboxExport['relay']> = {};
  if (typeof raw.webhookUrl === 'string' && raw.webhookUrl.trim()) out.webhookUrl = raw.webhookUrl.trim();
  if (typeof raw.keyHeader === 'string' && raw.keyHeader.trim()) out.keyHeader = raw.keyHeader.trim();
  if (typeof raw.keyPrefix === 'string') out.keyPrefix = raw.keyPrefix;
  return Object.keys(out).length ? out : null;
}

function extractJson(text: string): string {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const body = (fenced ? fenced[1] : trimmed).trim();
  try {
    JSON.parse(body);
    return body;
  } catch {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start >= 0 && end > start) return body.slice(start, end + 1);
    return body;
  }
}

function parseThread(entry: unknown, index: number, seen: Set<string>): Thread | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const raw = entry as Record<string, unknown>;
  const id = uniqueId(nonEmptyString(raw.id) ?? `thread-${index + 1}`, seen);
  const subject = nonEmptyString(raw.subject) ?? '(no subject)';
  const participants = parseParticipantList(raw.participants);
  const messages = parseMessages(raw.messages);
  const declaredLast = typeof raw.lastMessageAt === 'string' ? raw.lastMessageAt : '';
  const derivedLast = [...messages].reverse().find((message) => message.date)?.date ?? '';
  const thread: Thread = {
    id,
    subject,
    participants,
    lastMessageAt: declaredLast || derivedLast,
    messages,
  };
  const count = parseCount(raw.messageCount);
  if (count != null) thread.messageCount = count;
  return thread;
}

function parseMessages(value: unknown): Message[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .map((entry, index) => parseMessage(entry, index, seen))
    .filter((message): message is Message => message !== null)
    .map((message, index) => ({ message, index }))
    .sort((a, b) => {
      const byDate = compareIsoAsc(a.message.date, b.message.date);
      return byDate === 0 ? a.index - b.index : byDate;
    })
    .map((item) => item.message);
}

function parseMessage(entry: unknown, index: number, seen: Set<string>): Message | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const raw = entry as Record<string, unknown>;
  const message: Message = {
    id: uniqueId(nonEmptyString(raw.id) ?? `message-${index + 1}`, seen),
    from: parseParticipant(raw.from) ?? { address: '' },
    to: parseParticipantList(raw.to),
    date: typeof raw.date === 'string' ? raw.date : '',
    subject: typeof raw.subject === 'string' ? raw.subject : '',
    attachments: parseAttachments(raw.attachments),
  };
  const direction = parseDirection(raw.direction);
  if (direction) message.direction = direction;
  const cc = parseParticipantList(raw.cc);
  if (cc.length > 0) message.cc = cc;
  if (typeof raw.text === 'string') message.text = raw.text;
  if (typeof raw.html === 'string') message.html = raw.html;
  return message;
}

function parseDirection(value: unknown): Direction | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'sent' || normalized === 'received') return normalized;
  return undefined;
}

function parseAttachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseAttachment).filter((item): item is Attachment => item !== null);
}

function parseAttachment(entry: unknown): Attachment | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const raw = entry as Record<string, unknown>;
  const attachment: Attachment = {
    filename: nonEmptyString(raw.filename) ?? 'attachment',
    contentType: nonEmptyString(raw.contentType) ?? 'application/octet-stream',
    size: parseSize(raw.size),
  };
  const sizeDisplay = nonEmptyString(raw.sizeDisplay);
  if (sizeDisplay) attachment.sizeDisplay = sizeDisplay;
  if (raw.inline === true) attachment.inline = true;
  const attachmentId = nonEmptyString(raw.attachmentId);
  if (attachmentId) attachment.attachmentId = attachmentId;
  const url = nonEmptyString(raw.url);
  if (url) attachment.url = url;
  return attachment;
}

function parseParticipantList(value: unknown): Participant[] {
  if (Array.isArray(value)) {
    return value.map(parseParticipant).filter((item): item is Participant => item !== null);
  }
  const one = parseParticipant(value);
  return one ? [one] : [];
}

function parseParticipant(value: unknown): Participant | null {
  if (typeof value === 'string') {
    const address = value.trim();
    return address ? { address } : null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const address = typeof raw.address === 'string' ? raw.address.trim() : '';
  const name = nonEmptyString(raw.name);
  if (!address && !name) return null;
  return name ? { name, address } : { address };
}

function parseSize(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function parseCount(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function uniqueId(id: string, seen: Set<string>): string {
  if (!seen.has(id)) {
    seen.add(id);
    return id;
  }
  let n = 2;
  let next = `${id}-${n}`;
  while (seen.has(next)) {
    n += 1;
    next = `${id}-${n}`;
  }
  seen.add(next);
  return next;
}

function compareIsoAsc(a: string, b: string): number {
  const da = Date.parse(a);
  const db = Date.parse(b);
  const aOk = Number.isFinite(da);
  const bOk = Number.isFinite(db);
  if (aOk && bOk && da !== db) return da - db;
  if (aOk && !bOk) return -1;
  if (!aOk && bOk) return 1;
  return 0;
}

function compareThreadsDesc(a: Thread, b: Thread): number {
  return compareIsoAsc(b.lastMessageAt, a.lastMessageAt);
}
