import { describe, expect, it } from 'vitest';
import { fuzzyFilter, fuzzyMatch } from './fuzzy';

describe('fuzzyMatch', () => {
  it('matches subsequences in order and reports indices', () => {
    expect(fuzzyMatch('rpl', 'Reply all')?.indices).toEqual([0, 2, 3]);
    expect(fuzzyMatch('lpa', 'Reply all')).toBeNull();
    expect(fuzzyMatch('', 'anything')).toEqual({ score: 0, indices: [] });
    expect(fuzzyMatch('too long query', 'short')).toBeNull();
  });

  it('prefers prefixes, word starts, and consecutive runs', () => {
    const items = ['Reply all', 'Reply', 'Archive thread', 'Mark unread', 'Starred', 'Search mail'];
    expect(fuzzyFilter('re', items, (s) => s).map((r) => r.item).slice(0, 2)).toEqual(['Reply', 'Reply all']);
    expect(fuzzyFilter('ra', items, (s) => s)[0].item).toBe('Reply all');
    expect(fuzzyFilter('arch', items, (s) => s)[0].item).toBe('Archive thread');
    expect(fuzzyFilter('mu', items, (s) => s)[0].item).toBe('Mark unread');
  });

  it('keeps original order and everything when the query is empty', () => {
    const items = ['b', 'a', 'c'];
    expect(fuzzyFilter('', items, (s) => s).map((r) => r.item)).toEqual(items);
    expect(fuzzyFilter('', items, (s) => s, 2)).toHaveLength(2);
  });
});
