import type { InboxExport, Message, Thread } from '../types/inbox';
import { plusTags, threadAddresses } from './addresses';
import { EMPTY_STATE, isArchived, isStarred, isUnread, threadLabels, type LocalInboxState } from './localInboxState';
import { htmlToPlainSnippet, snippetFromText } from './text';

export type DirectionFilter = 'all' | 'sent' | 'received';
export type Folder = 'inbox' | 'starred' | 'archived' | 'unread';

export interface ThreadFilters {
  query: string;
  folder: Folder;
  direction: DirectionFilter;
  /** Lowercase plus-tag without the leading "+". Null means every tag. */
  tag: string | null;
  /** A label the owner added locally. Null means every label. */
  label: string | null;
}

export const INITIAL_FILTERS: ThreadFilters = { query: '', folder: 'inbox', direction: 'all', tag: null, label: null };

export const FOLDERS: { id: Folder; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'unread', label: 'Unread' },
  { id: 'starred', label: 'Starred' },
  { id: 'archived', label: 'Archived' },
];

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

export function filterThreads(
  threads: Thread[],
  filters: ThreadFilters,
  state: LocalInboxState = EMPTY_STATE,
  inboxAddress = '',
): Thread[] {
  const query = filters.query.trim().toLowerCase();
  return threads.filter((thread) => {
    if (!inFolder(thread, filters.folder, state, inboxAddress)) return false;
    if (filters.label && !threadLabels(thread.id, state).includes(filters.label)) return false;
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

function inFolder(thread: Thread, folder: Folder, state: LocalInboxState, inboxAddress: string): boolean {
  const archived = isArchived(thread.id, state);
  switch (folder) {
    case 'archived':
      return archived;
    case 'starred':
      return isStarred(thread.id, state);
    case 'unread':
      return !archived && isUnread(thread, state, inboxAddress);
    default:
      return !archived;
  }
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
