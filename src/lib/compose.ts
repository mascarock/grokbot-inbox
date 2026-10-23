import { addressesEqual, formatParticipant } from './addresses';
import type { ComposeKind, Recipient } from './command';
import { formatMessageTime } from './dates';
import { htmlToPlainSnippet, splitQuotedText } from './text';
import type { Message, Participant, Thread } from '../types/inbox';

export interface Draft {
  id: string;
  kind: ComposeKind;
  threadId?: string;
  inReplyTo?: string;
  to: string;
  cc: string;
  subject: string;
  body: string;
  /** Original message text, kept separate so the textarea stays short. */
  quoted: string;
  includeQuote: boolean;
  updatedAt: string;
  handedToBotAt?: string;
}

export function draftKey(kind: ComposeKind, threadId?: string): string {
  return kind === 'new' || !threadId ? 'new' : `thread:${threadId}`;
}

export function prefixSubject(subject: string, prefix: 'Re' | 'Fwd'): string {
  const trimmed = subject.trim();
  const pattern = prefix === 'Re' ? /^(re|aw|sv)\s*:/i : /^(fwd?|wg|tr)\s*:/i;
  return pattern.test(trimmed) ? trimmed : `${prefix}: ${trimmed || '(no subject)'}`;
}

export function messagePlainText(message: Message): string {
  const text = message.text?.trim();
  if (text) return text;
  if (message.html?.trim()) return htmlToPlainSnippet(message.html).replace(/[ \t]+/g, ' ').trim();
  return '';
}

function uniqueRecipients(people: Participant[], exclude: string): Recipient[] {
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const person of people) {
    const address = person.address?.trim();
    if (!address || addressesEqual(address, exclude)) continue;
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(person.name ? { name: person.name, address } : { address });
  }
  return out;
}

export function recipientsToText(recipients: Recipient[]): string {
  return recipients.map((r) => (r.name ? `${r.name.replace(/[<>\r\n"]/g, '').trim()} <${r.address}>` : r.address)).join(', ');
}

function quoteBlock(message: Message): string {
  const who = formatParticipant(message.from);
  const when = message.date ? formatMessageTime(message.date) : 'an unknown time';
  const text = splitQuotedText(messagePlainText(message))
    .filter((segment) => segment.type === 'text')
    .map((segment) => segment.content)
    .join('\n')
    .trim();
  const quoted = text
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');
  return `On ${when}, ${who} wrote:\n${quoted}`;
}

function forwardBlock(message: Message): string {
  const lines = [
    '---------- Forwarded message ----------',
    `From: ${formatParticipant(message.from)}`,
    `Date: ${message.date ? formatMessageTime(message.date) : 'unknown'}`,
    `Subject: ${message.subject || '(no subject)'}`,
    `To: ${message.to.map(formatParticipant).join(', ')}`,
  ];
  if (message.cc && message.cc.length > 0) lines.push(`Cc: ${message.cc.map(formatParticipant).join(', ')}`);
  const files = message.attachments.filter((a) => !a.inline).map((a) => a.filename);
  if (files.length > 0) lines.push(`Attachments (not included): ${files.join(', ')}`);
  lines.push('', messagePlainText(message));
  return lines.join('\n');
}

export function startDraft(kind: ComposeKind, inbox: string, thread?: Thread, message?: Message): Draft {
  const now = new Date().toISOString();
  if (kind === 'new' || !thread || !message) {
    return {
      id: 'new',
      kind: 'new',
      to: '',
      cc: '',
      subject: '',
      body: '',
      quoted: '',
      includeQuote: false,
      updatedAt: now,
    };
  }
  const sentByMe = addressesEqual(message.from.address, inbox);
  let to: Recipient[] = [];
  let cc: Recipient[] = [];
  if (kind === 'reply') {
    to = sentByMe ? uniqueRecipients(message.to, inbox) : uniqueRecipients([message.from], inbox);
  } else if (kind === 'reply-all') {
    to = uniqueRecipients(sentByMe ? message.to : [message.from, ...message.to], inbox);
    const toSet = new Set(to.map((r) => r.address.toLowerCase()));
    cc = uniqueRecipients(message.cc ?? [], inbox).filter((r) => !toSet.has(r.address.toLowerCase()));
  }
  const isForward = kind === 'forward';
  return {
    id: draftKey(kind, thread.id),
    kind,
    threadId: thread.id,
    inReplyTo: isForward ? undefined : message.id,
    to: recipientsToText(to),
    cc: recipientsToText(cc),
    subject: prefixSubject(message.subject || thread.subject, isForward ? 'Fwd' : 'Re'),
    body: '',
    quoted: isForward ? forwardBlock(message) : quoteBlock(message),
    includeQuote: true,
    updatedAt: now,
  };
}

/** The text that goes to the bot: the typed body plus the quoted original when kept. */
export function draftBody(draft: Draft): string {
  const body = draft.body.replace(/\s+$/, '');
  if (!draft.includeQuote || !draft.quoted.trim()) return body;
  return body ? `${body}\n\n${draft.quoted}` : draft.quoted;
}
