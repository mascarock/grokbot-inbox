/**
 * Bot command blocks. The viewer never sends mail; it formats a block the
 * owner pastes into their Grok Bot chat, and the bot shows a draft card.
 * Format reference: docs/COMMANDS.md.
 */

export const SEND_COMMAND = '/inbox-send';
export const REFRESH_COMMAND = '/inbox-refresh';
export const COMMAND_VERSION = 'v1';
export const BODY_SEPARATOR = '---';

export type ComposeKind = 'new' | 'reply' | 'reply-all' | 'forward';

export interface Recipient {
  name?: string;
  address: string;
}

export interface SendCommand {
  version: string;
  from: string;
  kind?: ComposeKind;
  thread?: string;
  inReplyTo?: string;
  to: Recipient[];
  cc: Recipient[];
  subject: string;
  body: string;
}

export interface RefreshCommand {
  version: string;
  inbox?: string;
}

export class CommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandError';
  }
}

const KINDS: ComposeKind[] = ['new', 'reply', 'reply-all', 'forward'];
const HEADER_LINE = /^([a-z][a-z-]*):\s?(.*)$/;
// One mailbox: no whitespace, no angle brackets or separators, one @, a dotted host.
const ADDRESS = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

export function isValidAddress(address: string): boolean {
  return ADDRESS.test(address.trim());
}

export function formatRecipient(recipient: Recipient): string {
  const address = recipient.address.trim();
  const name = recipient.name?.trim();
  if (!name) return address;
  const safeName = name.replace(/[<>\r\n"]/g, '').trim();
  return safeName ? `${safeName} <${address}>` : address;
}

export function formatRecipients(recipients: Recipient[]): string {
  return recipients.map(formatRecipient).join(', ');
}

/** "Alice <a@example.com>, b@example.com" → recipients. Throws on a bad address. */
export function parseRecipients(value: string): Recipient[] {
  const out: Recipient[] = [];
  for (const part of splitRecipients(value)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const bracket = trimmed.match(/^(.*?)\s*<([^<>]+)>$/);
    const address = (bracket ? bracket[2] : trimmed).trim();
    if (!isValidAddress(address)) throw new CommandError(`Not a valid email address: ${address}`);
    const name = bracket ? bracket[1].trim().replace(/^"|"$/g, '').trim() : '';
    out.push(name ? { name, address } : { address });
  }
  return out;
}

function splitRecipients(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inBracket = false;
  let inQuote = false;
  for (const ch of value) {
    if (ch === '"') inQuote = !inQuote;
    else if (ch === '<' && !inQuote) inBracket = true;
    else if (ch === '>' && !inQuote) inBracket = false;
    if ((ch === ',' || ch === ';') && !inBracket && !inQuote) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

export function formatSendCommand(command: Omit<SendCommand, 'version'> & { version?: string }): string {
  const lines: string[] = [`${SEND_COMMAND} ${command.version ?? COMMAND_VERSION}`];
  const from = command.from.trim();
  if (!isValidAddress(from)) throw new CommandError('The from address is not valid.');
  if (command.to.length === 0) throw new CommandError('Add at least one recipient.');
  if (!command.subject.trim()) throw new CommandError('Add a subject.');
  if (!command.body.trim()) throw new CommandError('The message body is empty.');
  for (const recipient of [...command.to, ...command.cc]) {
    if (!isValidAddress(recipient.address)) {
      throw new CommandError(`Not a valid email address: ${recipient.address}`);
    }
  }

  lines.push(header('from', from));
  if (command.kind) lines.push(header('kind', command.kind));
  if (command.thread) lines.push(header('thread', command.thread));
  if (command.inReplyTo) lines.push(header('in-reply-to', command.inReplyTo));
  lines.push(header('to', formatRecipients(command.to)));
  if (command.cc.length > 0) lines.push(header('cc', formatRecipients(command.cc)));
  lines.push(header('subject', command.subject));
  lines.push(BODY_SEPARATOR);
  lines.push(escapeBody(command.body));
  return lines.join('\n');
}

export function formatRefreshCommand(inbox?: string): string {
  const lines = [`${REFRESH_COMMAND} ${COMMAND_VERSION}`];
  if (inbox?.trim()) lines.push(header('inbox', inbox.trim()));
  return lines.join('\n');
}

function header(name: string, value: string): string {
  if (/[\r\n]/.test(value)) throw new CommandError(`The ${name} field cannot contain a line break.`);
  return `${name}: ${value.trim()}`;
}

/** Lines that would be read as the separator, or that start with "\", get a leading "\". */
export function escapeBody(body: string): string {
  return normalizeNewlines(body)
    .split('\n')
    .map((line) => (line.startsWith('\\') || isSeparator(line) ? `\\${line}` : line))
    .join('\n');
}

export function unescapeBody(body: string): string {
  return body
    .split('\n')
    .map((line) => (line.startsWith('\\') ? line.slice(1) : line))
    .join('\n');
}

function isSeparator(line: string): boolean {
  return line.trim() === BODY_SEPARATOR;
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export type ParsedCommand = { type: 'send'; command: SendCommand } | { type: 'refresh'; command: RefreshCommand };

/** Parse a pasted block. Throws CommandError with a reason the owner can act on. */
export function parseCommand(text: string): ParsedCommand {
  // Only CRLF becomes LF here; a bare CR inside a header is rejected by readHeaders.
  const lines = stripFence(text).replace(/\r\n/g, '\n').split('\n');
  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  const first = (lines.shift() ?? '').trim();
  const [name, version = COMMAND_VERSION, ...rest] = first.split(/\s+/);
  if (rest.length > 0) throw new CommandError('The first line must be the command and its version only.');
  if (!/^v\d+$/.test(version)) throw new CommandError(`Unknown command version: ${version}`);

  if (name === REFRESH_COMMAND) {
    const { headers } = readHeaders(lines, false);
    const inbox = headers.get('inbox');
    if (inbox !== undefined && !isValidAddress(inbox)) throw new CommandError('The inbox address is not valid.');
    return { type: 'refresh', command: inbox ? { version, inbox } : { version } };
  }
  if (name !== SEND_COMMAND) {
    throw new CommandError(`Unknown command: ${name || '(empty)'}`);
  }

  const { headers, bodyLines, sawSeparator } = readHeaders(lines, true);
  if (!sawSeparator) throw new CommandError(`Missing the "${BODY_SEPARATOR}" line between headers and body.`);

  const from = required(headers, 'from');
  if (!isValidAddress(from)) throw new CommandError('The from address is not valid.');
  const to = parseRecipients(required(headers, 'to'));
  if (to.length === 0) throw new CommandError('The to field is empty.');
  const cc = headers.has('cc') ? parseRecipients(headers.get('cc') ?? '') : [];
  const subject = required(headers, 'subject');
  const body = unescapeBody(normalizeNewlines(bodyLines.join('\n'))).replace(/\s+$/, '');
  if (!body.trim()) throw new CommandError('The message body is empty.');

  const command: SendCommand = { version, from, to, cc, subject, body };
  const kind = headers.get('kind');
  if (kind !== undefined) {
    if (!KINDS.includes(kind as ComposeKind)) throw new CommandError(`Unknown kind: ${kind}`);
    command.kind = kind as ComposeKind;
  }
  const thread = headers.get('thread');
  if (thread) command.thread = thread;
  const inReplyTo = headers.get('in-reply-to');
  if (inReplyTo) command.inReplyTo = inReplyTo;
  return { type: 'send', command };
}

function readHeaders(lines: string[], expectBody: boolean) {
  const headers = new Map<string, string>();
  let sawSeparator = false;
  let index = 0;
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (isSeparator(line)) {
      sawSeparator = true;
      index += 1;
      break;
    }
    if (line.trim() === '') {
      if (expectBody) continue;
      break;
    }
    const match = line.match(HEADER_LINE);
    if (!match) {
      throw new CommandError(`Not a header line (put "${BODY_SEPARATOR}" before the body): ${line.slice(0, 60)}`);
    }
    const key = match[1];
    const value = match[2];
    if (/[\r\n]/.test(line)) throw new CommandError(`The ${key} field cannot contain a line break.`);
    if (headers.has(key)) throw new CommandError(`Duplicate header: ${key}`);
    headers.set(key, value.trim());
  }
  return { headers, bodyLines: lines.slice(index), sawSeparator };
}

function required(headers: Map<string, string>, key: string): string {
  const value = headers.get(key);
  if (value === undefined || value === '') throw new CommandError(`Missing header: ${key}`);
  return value;
}

function stripFence(text: string): string {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  const fenced = trimmed.match(/^```[a-z]*\s*\n([\s\S]*?)\n```$/i);
  return fenced ? fenced[1] : trimmed;
}
