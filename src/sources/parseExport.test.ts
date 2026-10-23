import { describe, expect, it } from 'vitest';
import { createFileSource } from './fileSource';
import { ExportParseError, parseExportText, parseInboxExport } from './parseExport';
import { createUrlSource } from './urlSource';

const minimal = {
  inbox: 'demo+roma@mail.grokbot.com',
  exportedAt: '2026-10-23T14:05:00Z',
  threads: [
    {
      id: 't1',
      subject: 'Hello',
      participants: [{ address: 'alice@example.com' }],
      lastMessageAt: '2026-10-23T09:00:00Z',
      messages: [
        {
          id: 'm1',
          from: { address: 'alice@example.com' },
          to: [{ address: 'demo+roma@mail.grokbot.com' }],
          date: '2026-10-23T09:00:00Z',
          subject: 'Hello',
          text: 'Hi',
        },
      ],
    },
  ],
};

describe('parseInboxExport', () => {
  it('fills missing optional fields and drops unknown ones', () => {
    const parsed = parseInboxExport({
      ...minimal,
      extra: true,
      threads: [
        {
          ...minimal.threads[0],
          nickname: 'ignored',
          messages: [
            {
              id: 'm1',
              from: { address: 'alice@example.com', nickname: 'A' },
              to: 'bob@example.com',
              date: '2026-10-23T09:00:00Z',
              subject: 'Hello',
              text: 'Hi',
              unexpected: 1,
            },
          ],
        },
      ],
    });

    expect(parsed.inbox).toBe('demo+roma@mail.grokbot.com');
    expect((parsed as { extra?: unknown }).extra).toBeUndefined();
    const message = parsed.threads[0]?.messages[0];
    expect(message?.attachments).toEqual([]);
    expect(message?.cc).toBeUndefined();
    expect(message?.direction).toBeUndefined();
    expect(message?.from.name).toBeUndefined();
    expect(message?.to).toEqual([{ address: 'bob@example.com' }]);
    expect(parsed.threads[0]?.messageCount).toBeUndefined();
  });

  it('keeps a larger messageCount and normalizes direction', () => {
    const parsed = parseInboxExport({
      ...minimal,
      threads: [
        {
          ...minimal.threads[0],
          messageCount: '4',
          messages: [
            { ...minimal.threads[0].messages[0], direction: 'SENT', attachments: [{ filename: 'a.txt', size: '12' }] },
          ],
        },
      ],
    });
    expect(parsed.threads[0]?.messageCount).toBe(4);
    expect(parsed.threads[0]?.messages[0]?.direction).toBe('sent');
    expect(parsed.threads[0]?.messages[0]?.attachments[0]).toMatchObject({
      filename: 'a.txt',
      contentType: 'application/octet-stream',
      size: 12,
    });
  });

  it('drops invalid direction, negative size, and non-boolean inline', () => {
    const parsed = parseInboxExport({
      ...minimal,
      threads: [
        {
          ...minimal.threads[0],
          messages: [
            {
              ...minimal.threads[0].messages[0],
              direction: 'draft',
              attachments: [{ filename: 'x', contentType: 'text/plain', size: -5, inline: 'true' }],
            },
          ],
        },
      ],
    });
    expect(parsed.threads[0]?.messages[0]?.direction).toBeUndefined();
    expect(parsed.threads[0]?.messages[0]?.attachments[0]).toMatchObject({ size: 0 });
    expect(parsed.threads[0]?.messages[0]?.attachments[0]?.inline).toBeUndefined();
  });

  it('sorts threads newest first and messages oldest first', () => {
    const parsed = parseInboxExport({
      inbox: 'a@example.com',
      exportedAt: '2026-10-23T00:00:00Z',
      threads: [
        {
          id: 'old',
          subject: 'Old',
          participants: [],
          lastMessageAt: '2026-10-20T00:00:00Z',
          messages: [
            { id: 'b', from: { address: 'a@example.com' }, to: [], date: '2026-10-20T02:00:00Z', subject: '', text: 'later' },
            { id: 'a', from: { address: 'a@example.com' }, to: [], date: '2026-10-20T01:00:00Z', subject: '', text: 'earlier' },
          ],
        },
        {
          id: 'new',
          subject: 'New',
          participants: [],
          lastMessageAt: '2026-10-23T00:00:00Z',
          messages: [],
        },
      ],
    });
    expect(parsed.threads.map((thread) => thread.id)).toEqual(['new', 'old']);
    expect(parsed.threads[1]?.messages.map((message) => message.id)).toEqual(['a', 'b']);
  });

  it('uniques duplicate ids and opens a threads array with no inbox', () => {
    const parsed = parseInboxExport({
      threads: [
        { id: 't', subject: '', participants: [], messages: [{ id: 'm' }, { id: 'm', text: 'second' }] },
      ],
    });
    expect(parsed.inbox).toBe('Unknown inbox');
    expect(parsed.exportedAt).toBe('');
    expect(parsed.threads[0]?.messages.map((message) => message.id)).toEqual(['m', 'm-2']);
  });

  it('rejects JSON that is not an inbox export', () => {
    expect(() => parseInboxExport([])).toThrow(ExportParseError);
    expect(() => parseInboxExport({ inbox: 'a@example.com' })).toThrow(/threads/);
    expect(() => parseExportText('not json')).toThrow(/not valid JSON/);
  });

  it('recovers fenced JSON and a short preface', () => {
    const fenced = parseExportText('```json\n' + JSON.stringify(minimal) + '\n```');
    expect(fenced.threads).toHaveLength(1);
    const prefaced = parseExportText('Here is your export:\n' + JSON.stringify(minimal) + '\nThanks.');
    expect(prefaced.inbox).toBe(minimal.inbox);
  });

  it('keeps a source object and ignores a source array', () => {
    expect(parseInboxExport({ ...minimal, source: { via: 'sample', readOnly: true } }).source).toEqual({
      via: 'sample',
      readOnly: true,
    });
    expect(parseInboxExport({ ...minimal, source: ['nope'] }).source).toBeUndefined();
  });
});

describe('sources', () => {
  it('reads a File in the browser', async () => {
    const file = new File([JSON.stringify(minimal)], 'inbox.json', { type: 'application/json' });
    const inbox = await createFileSource(file).load();
    expect(inbox.threads).toHaveLength(1);
    expect(createFileSource(file).kind).toBe('file');
  });

  it('refuses non-http src URLs before fetching', async () => {
    await expect(createUrlSource('javascript:alert(1)').load()).rejects.toThrow(/http/);
    await expect(createUrlSource('not a url').load()).rejects.toThrow(/not valid/);
  });
});
