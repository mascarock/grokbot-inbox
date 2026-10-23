import type { InboxExport, Message, Thread } from '../types/inbox';
import { plusTags, threadAddresses } from './addresses';
import { htmlToPlainSnippet, snippetFromText } from './text';

export type DirectionFilter = 'all' | 'sent' | 'received';

export interface ThreadFilters {
  query: string;
  direction: DirectionFilter;
  /** Lowercase plus-tag without the leading "+". Null means every tag. */
  tag: string | null;
}

/** Missing or unknown direction is treated as received. */
export function effectiveDirection(message: Message): 'sent' | 'received' {
  return message.direction === 'sent' ? 'sent' : 'received';
}

export function messageSnippet(message: Message): string {
  const text = message.text?.trim();
  if (text) return snippetFromText(text);
  if (message.html?.trim()) return snippetFromText(htmlToPlainSnippet(message.html));
  return '';
}

export function collectPlusTags(inbox: InboxExport): string[] {
  const tags = new Set<string>();
  for (const thread of inbox.threads) {
    for (const address of threadAddresses(thread)) {
      for (const tag of plusTags(address)) tags.add(tag);
    }
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

export function filterThreads(threads: Thread[], filters: ThreadFilters): Thread[] {
  const query = filters.query.trim().toLowerCase();
  return threads.filter((thread) => {
    if (filters.direction !== 'all') {
      const matches = thread.messages.some((message) => effectiveDirection(message) === filters.direction);
      if (!matches) return false;
    }
    if (filters.tag) {
      const tags = threadAddresses(thread).flatMap((address) => plusTags(address));
      if (!tags.includes(filters.tag)) return false;
    }
    if (!query) return true;
    const haystack = searchableText(thread);
    return haystack.includes(query);
  });
}

function searchableText(thread: Thread): string {
  const parts: string[] = [thread.subject];
  for (const participant of thread.participants) {
    parts.push(participant.name ?? '', participant.address);
  }
  for (const message of thread.messages) {
    parts.push(message.subject, message.text ?? '', message.from.name ?? '', message.from.address);
    if (message.html) parts.push(htmlToPlainSnippet(message.html));
    for (const person of message.to) parts.push(person.name ?? '', person.address);
    for (const person of message.cc ?? []) parts.push(person.name ?? '', person.address);
    for (const attachment of message.attachments) parts.push(attachment.filename);
  }
  return parts.join('\n').toLowerCase();
}

export function countLabel(thread: Thread): string {
  const included = thread.messages.length;
  if (thread.messageCount != null && thread.messageCount !== included) {
    return `${included}/${thread.messageCount}`;
  }
  return String(thread.messageCount ?? included);
}
