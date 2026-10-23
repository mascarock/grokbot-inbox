import { describe, expect, it } from 'vitest';
import { plusTags } from './addresses';
import { collectPlusTags, filterThreads, type ThreadFilters } from './filterThreads';
import { parseInboxExport } from '../sources/parseExport';

const inbox = parseInboxExport({
  inbox: 'demo+roma@mail.grokbot.com',
  exportedAt: '2026-10-23T14:05:00Z',
  threads: [
    {
      id: 'roma',
      subject: 'Tent',
      participants: [{ address: 'demo+roma@mail.grokbot.com' }, { name: 'Alice', address: 'alice@example.com' }],
      lastMessageAt: '2026-10-23T10:00:00Z',
      messages: [
        {
          id: 'm1',
          direction: 'received',
          from: { address: 'alice@example.com' },
          to: [{ address: 'demo+roma@mail.grokbot.com' }],
          date: '2026-10-23T10:00:00Z',
          subject: 'Tent',
          text: 'Orange tent by the gate',
          attachments: [],
        },
      ],
    },
    {
      id: 'sent',
      subject: 'Cables',
      participants: [{ address: 'demo+roma@mail.grokbot.com' }],
      lastMessageAt: '2026-10-23T09:00:00Z',
      messages: [
        {
          id: 'm2',
          direction: 'sent',
          from: { address: 'demo+roma@mail.grokbot.com' },
          to: [{ address: 'leo@example.com' }],
          date: '2026-10-23T09:00:00Z',
          subject: 'Cables',
          text: 'Projector is packed',
          attachments: [{ filename: 'packing-list.txt', contentType: 'text/plain', size: 10 }],
        },
      ],
    },
    {
      id: 'paris',
      subject: 'Side trip',
      participants: [{ address: 'demo+paris@mail.grokbot.com' }],
      lastMessageAt: '2026-10-19T18:00:00Z',
      messages: [
        {
          id: 'm3',
          from: { address: 'chloe@example.com' },
          to: [{ address: 'demo+paris@mail.grokbot.com' }],
          date: '2026-10-19T18:00:00Z',
          subject: 'Side trip',
          text: 'Viewpoint walk',
          attachments: [],
        },
      ],
    },
  ],
});

function filters(partial: Partial<ThreadFilters> = {}): ThreadFilters {
  return { query: '', direction: 'all', tag: null, ...partial };
}

describe('plus tags and filters', () => {
  it('reads plus-tags from the local part', () => {
    expect(plusTags('demo+roma@mail.grokbot.com')).toEqual(['roma']);
    expect(plusTags('Demo+Roma@mail.grokbot.com')).toEqual(['roma']);
    expect(plusTags('a+rome+build@example.com')).toEqual(['rome', 'build']);
    expect(plusTags('alice@example.com')).toEqual([]);
  });

  it('collects tags from message addresses, not from the inbox field alone', () => {
    expect(collectPlusTags(inbox)).toEqual(['paris', 'roma']);
  });

  it('filters by tag, direction, and search text', () => {
    expect(filterThreads(inbox.threads, filters({ tag: 'roma' })).map((thread) => thread.id)).toEqual(['roma', 'sent']);
    expect(filterThreads(inbox.threads, filters({ tag: 'paris' })).map((thread) => thread.id)).toEqual(['paris']);
    expect(filterThreads(inbox.threads, filters({ direction: 'sent' })).map((thread) => thread.id)).toEqual(['sent']);
    expect(filterThreads(inbox.threads, filters({ direction: 'received' })).map((thread) => thread.id)).toEqual([
      'roma',
      'paris',
    ]);
    expect(filterThreads(inbox.threads, filters({ query: 'PROJECTOR' })).map((thread) => thread.id)).toEqual(['sent']);
    expect(filterThreads(inbox.threads, filters({ query: 'packing-list' })).map((thread) => thread.id)).toEqual(['sent']);
  });
});
