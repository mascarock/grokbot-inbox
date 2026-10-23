import type { Draft } from './compose';
import type { Thread } from '../types/inbox';
import { addressesEqual } from './addresses';

/**
 * Everything the owner does in the viewer (read, star, archive, labels,
 * drafts) lives in localStorage, keyed per inbox. Nothing here leaves the
 * browser; the export itself is never modified.
 */
export interface LocalInboxState {
  /** Thread id → id of the last message that was on screen when it was opened. */
  read: Record<string, string>;
  starred: string[];
  archived: string[];
  labels: Record<string, string[]>;
  drafts: Record<string, Draft>;
}

export const EMPTY_STATE: LocalInboxState = { read: {}, starred: [], archived: [], labels: {}, drafts: {} };

const PREFIX = 'grokbot-inbox:state:';

export function stateKey(inbox: string): string {
  return `${PREFIX}${inbox.trim().toLowerCase()}`;
}

export function loadState(inbox: string, storage: Storage | null = safeStorage()): LocalInboxState {
  if (!storage) return EMPTY_STATE;
  try {
    const raw = storage.getItem(stateKey(inbox));
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<LocalInboxState>;
    return {
      read: isRecord(parsed.read) ? (parsed.read as Record<string, string>) : {},
      starred: Array.isArray(parsed.starred) ? parsed.starred.filter(isString) : [],
      archived: Array.isArray(parsed.archived) ? parsed.archived.filter(isString) : [],
      labels: isRecord(parsed.labels) ? (parsed.labels as Record<string, string[]>) : {},
      drafts: isRecord(parsed.drafts) ? (parsed.drafts as Record<string, Draft>) : {},
    };
  } catch {
    return EMPTY_STATE;
  }
}

export function saveState(inbox: string, state: LocalInboxState, storage: Storage | null = safeStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(stateKey(inbox), JSON.stringify(state));
  } catch {
    // Quota or privacy mode: the session keeps working in memory.
  }
}

export function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function lastMessageId(thread: Thread): string {
  return thread.messages[thread.messages.length - 1]?.id ?? '';
}

/** A thread is unread when its newest message is not from the inbox and has not been opened. */
export function isUnread(thread: Thread, state: LocalInboxState, inbox: string): boolean {
  const latest = thread.messages[thread.messages.length - 1];
  if (!latest) return false;
  if (addressesEqual(latest.from.address, inbox)) return false;
  return state.read[thread.id] !== latest.id;
}

export function isStarred(threadId: string, state: LocalInboxState): boolean {
  return state.starred.includes(threadId);
}

export function isArchived(threadId: string, state: LocalInboxState): boolean {
  return state.archived.includes(threadId);
}

export function threadLabels(threadId: string, state: LocalInboxState): string[] {
  return state.labels[threadId] ?? [];
}

export function allLabels(state: LocalInboxState): string[] {
  const set = new Set<string>();
  for (const list of Object.values(state.labels)) for (const label of list) set.add(label);
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function markRead(state: LocalInboxState, thread: Thread): LocalInboxState {
  const id = lastMessageId(thread);
  if (!id || state.read[thread.id] === id) return state;
  return { ...state, read: { ...state.read, [thread.id]: id } };
}

export function markUnread(state: LocalInboxState, threadId: string): LocalInboxState {
  if (!(threadId in state.read)) return state;
  const read = { ...state.read };
  delete read[threadId];
  return { ...state, read };
}

export function toggleStar(state: LocalInboxState, threadId: string): LocalInboxState {
  return { ...state, starred: toggleIn(state.starred, threadId) };
}

export function toggleArchive(state: LocalInboxState, threadId: string): LocalInboxState {
  return { ...state, archived: toggleIn(state.archived, threadId) };
}

export function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ').slice(0, 40);
}

export function addLabel(state: LocalInboxState, threadId: string, label: string): LocalInboxState {
  const clean = normalizeLabel(label);
  if (!clean) return state;
  const current = state.labels[threadId] ?? [];
  if (current.some((item) => item.toLowerCase() === clean.toLowerCase())) return state;
  return { ...state, labels: { ...state.labels, [threadId]: [...current, clean] } };
}

export function removeLabel(state: LocalInboxState, threadId: string, label: string): LocalInboxState {
  const current = state.labels[threadId];
  if (!current) return state;
  const next = current.filter((item) => item !== label);
  const labels = { ...state.labels };
  if (next.length === 0) delete labels[threadId];
  else labels[threadId] = next;
  return { ...state, labels };
}

export function putDraft(state: LocalInboxState, draft: Draft): LocalInboxState {
  return { ...state, drafts: { ...state.drafts, [draft.id]: draft } };
}

export function dropDraft(state: LocalInboxState, id: string): LocalInboxState {
  if (!(id in state.drafts)) return state;
  const drafts = { ...state.drafts };
  delete drafts[id];
  return { ...state, drafts };
}

export function draftForThread(threadId: string, state: LocalInboxState): Draft | undefined {
  return state.drafts[`thread:${threadId}`];
}

function toggleIn(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}
