import { describe, expect, it } from 'vitest';
import sample from '../../examples/sample-inbox.json';
import {
  EMPTY_STATE,
  addLabel,
  allLabels,
  dropDraft,
  isUnread,
  loadState,
  markRead,
  markUnread,
  putDraft,
  removeLabel,
  saveState,
  stateKey,
  toggleArchive,
  toggleStar,
} from './localInboxState';
import { startDraft } from './compose';
import { parseInboxExport } from '../sources/parseExport';

const inbox = parseInboxExport(sample);
const tent = inbox.threads.find((t) => t.id === 'th-tent');
if (!tent) throw new Error('sample thread missing');

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

describe('read state', () => {
  it('is unread until opened, and unread again when a newer message arrives', () => {
    expect(isUnread(tent, EMPTY_STATE, inbox.inbox)).toBe(true);
    const read = markRead(EMPTY_STATE, tent);
    expect(isUnread(tent, read, inbox.inbox)).toBe(false);
    const grown = { ...tent, messages: [...tent.messages, { ...tent.messages[2], id: 'm-tent-4' }] };
    expect(isUnread(grown, read, inbox.inbox)).toBe(true);
    expect(isUnread(tent, markUnread(read, tent.id), inbox.inbox)).toBe(true);
  });

  it('treats threads ending with my own message as read', () => {
    const mineLast = { ...tent, messages: tent.messages.slice(0, 2) };
    expect(isUnread(mineLast, EMPTY_STATE, inbox.inbox)).toBe(false);
  });
});

describe('star, archive, labels, drafts', () => {
  it('toggles and normalises', () => {
    let state = toggleStar(EMPTY_STATE, 'a');
    expect(state.starred).toEqual(['a']);
    state = toggleStar(state, 'a');
    expect(state.starred).toEqual([]);
    state = toggleArchive(state, 'a');
    expect(state.archived).toEqual(['a']);

    state = addLabel(state, 'a', '  Travel   plans ');
    state = addLabel(state, 'a', 'travel plans');
    state = addLabel(state, 'b', 'Receipts');
    expect(state.labels).toEqual({ a: ['Travel plans'], b: ['Receipts'] });
    expect(allLabels(state)).toEqual(['Receipts', 'Travel plans']);
    state = removeLabel(state, 'a', 'Travel plans');
    expect(state.labels).toEqual({ b: ['Receipts'] });

    const draft = startDraft('reply', inbox.inbox, tent, tent.messages[2]);
    state = putDraft(state, draft);
    expect(state.drafts['thread:th-tent']?.subject).toBe('Re: Meeting point at the orange tent');
    state = dropDraft(state, draft.id);
    expect(state.drafts).toEqual({});
  });

  it('round-trips through storage per inbox and survives garbage', () => {
    const storage = new MemoryStorage();
    const state = addLabel(toggleStar(EMPTY_STATE, 'a'), 'a', 'x');
    saveState('Demo+Roma@mail.grokbot.com', state, storage);
    expect(storage.getItem(stateKey('demo+roma@mail.grokbot.com'))).toBeTruthy();
    expect(loadState('demo+roma@mail.grokbot.com', storage)).toEqual(state);
    expect(loadState('other@mail.grokbot.com', storage)).toEqual(EMPTY_STATE);

    storage.setItem(stateKey('bad@mail.grokbot.com'), '{not json');
    expect(loadState('bad@mail.grokbot.com', storage)).toEqual(EMPTY_STATE);
    storage.setItem(stateKey('odd@mail.grokbot.com'), JSON.stringify({ starred: 'nope', archived: [1, 'ok'] }));
    expect(loadState('odd@mail.grokbot.com', storage)).toEqual({ ...EMPTY_STATE, archived: ['ok'] });
  });
});
