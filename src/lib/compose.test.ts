import { describe, expect, it } from 'vitest';
import sample from '../../examples/sample-inbox.json';
import { formatSendCommand, parseCommand, parseRecipients } from './command';
import { draftBody, prefixSubject, startDraft } from './compose';
import { parseInboxExport } from '../sources/parseExport';

const inbox = parseInboxExport(sample);
const tent = inbox.threads.find((t) => t.id === 'th-tent');
if (!tent) throw new Error('sample thread missing');
const [first, mine, last] = tent.messages;

describe('prefixSubject', () => {
  it('adds a prefix once', () => {
    expect(prefixSubject('Hello', 'Re')).toBe('Re: Hello');
    expect(prefixSubject('Re: Hello', 'Re')).toBe('Re: Hello');
    expect(prefixSubject('RE: Hello', 'Re')).toBe('RE: Hello');
    expect(prefixSubject('Re: Hello', 'Fwd')).toBe('Fwd: Re: Hello');
    expect(prefixSubject('Fwd: Hello', 'Fwd')).toBe('Fwd: Hello');
    expect(prefixSubject('', 'Re')).toBe('Re: (no subject)');
  });
});

describe('startDraft', () => {
  it('replies to the sender and never to the inbox itself', () => {
    const draft = startDraft('reply', inbox.inbox, tent, last);
    expect(draft.to).toBe('Alice Example <alice@example.com>');
    expect(draft.cc).toBe('');
    expect(draft.subject).toBe('Re: Meeting point at the orange tent');
    expect(draft.inReplyTo).toBe('m-tent-3');
    expect(draft.threadId).toBe('th-tent');
    expect(draft.quoted).toMatch(/^On .+Alice Example <alice@example.com> wrote:\n> Perfect/);
    expect(draft.quoted).not.toMatch(/\n> On .+ wrote:/);
  });

  it('replies to the recipients when replying to my own message', () => {
    const draft = startDraft('reply', inbox.inbox, tent, mine);
    expect(draft.to).toBe('Alice Example <alice@example.com>');
  });

  it('reply-all includes to and cc minus the inbox and duplicates', () => {
    const draft = startDraft('reply-all', inbox.inbox, tent, last);
    expect(parseRecipients(draft.to).map((r) => r.address)).toEqual(['alice@example.com']);
    expect(parseRecipients(draft.cc).map((r) => r.address)).toEqual(['events@example.com']);
  });

  it('forwards with an empty to, Fwd subject, and the forwarded block', () => {
    const draft = startDraft('forward', inbox.inbox, tent, first);
    expect(draft.to).toBe('');
    expect(draft.subject).toBe('Fwd: Meeting point at the orange tent');
    expect(draft.inReplyTo).toBeUndefined();
    expect(draft.quoted).toContain('---------- Forwarded message ----------');
    expect(draft.quoted).toContain('From: Alice Example <alice@example.com>');
  });

  it('produces a command the parser accepts, with the quote appended', () => {
    const draft = { ...startDraft('reply', inbox.inbox, tent, last), body: 'Perfect, see you there.' };
    const text = formatSendCommand({
      from: inbox.inbox,
      kind: draft.kind,
      thread: draft.threadId,
      inReplyTo: draft.inReplyTo,
      to: parseRecipients(draft.to),
      cc: parseRecipients(draft.cc),
      subject: draft.subject,
      body: draftBody(draft),
    });
    const parsed = parseCommand(text);
    if (parsed.type !== 'send') throw new Error('expected send');
    expect(parsed.command.body.startsWith('Perfect, see you there.\n\nOn ')).toBe(true);
    expect(parsed.command.thread).toBe('th-tent');
    expect(parsed.command.inReplyTo).toBe('m-tent-3');
  });
});
