import { describe, expect, it } from 'vitest';
import {
  CommandError,
  escapeBody,
  formatRefreshCommand,
  formatSendCommand,
  isValidAddress,
  parseCommand,
  parseRecipients,
  unescapeBody,
} from './command';

const base = {
  from: 'demo+roma@mail.grokbot.com',
  kind: 'reply' as const,
  thread: 'th-tent',
  inReplyTo: 'm-tent-3',
  to: [{ name: 'Alice Example', address: 'alice@example.com' }],
  cc: [{ address: 'events@example.com' }],
  subject: 'Re: Meeting point at the orange tent',
  body: 'See you at the tent.\n\n---\n\\already escaped\n> quoted line',
};

describe('send command', () => {
  it('formats and parses back the same command', () => {
    const text = formatSendCommand(base);
    expect(text.split('\n')[0]).toBe('/inbox-send v1');
    expect(text).toContain('to: Alice Example <alice@example.com>');
    expect(text).toContain('\n\\---\n');
    expect(text).toContain('\n\\\\already escaped\n');

    const parsed = parseCommand(text);
    expect(parsed.type).toBe('send');
    if (parsed.type !== 'send') return;
    expect(parsed.command).toEqual({ version: 'v1', ...base });
  });

  it('round-trips bodies through escape and unescape', () => {
    for (const body of ['---', '  ---  ', '\\', '\\\\---', 'plain\n---\nmore', '\r\nwindows\r\n---\r\n']) {
      expect(unescapeBody(escapeBody(body))).toBe(body.replace(/\r\n/g, '\n'));
    }
  });

  it('accepts a fenced paste with Windows line endings and bare addresses', () => {
    const text = '```\r\n' + formatSendCommand({ ...base, cc: [], to: [{ address: 'bob@example.com' }] }).replace(/\n/g, '\r\n') + '\r\n```';
    const parsed = parseCommand(text);
    if (parsed.type !== 'send') throw new Error('expected send');
    expect(parsed.command.to).toEqual([{ address: 'bob@example.com' }]);
    expect(parsed.command.cc).toEqual([]);
    expect(parsed.command.body).toBe(base.body);
  });

  it('rejects line breaks in header fields when formatting', () => {
    expect(() => formatSendCommand({ ...base, subject: 'Hi\nbcc: evil@example.com' })).toThrow(CommandError);
    expect(() => formatSendCommand({ ...base, subject: 'Hi\rX' })).toThrow(/line break/);
    expect(() => formatSendCommand({ ...base, to: [{ name: 'A\n', address: 'a@example.com' }] })).not.toThrow();
    expect(formatSendCommand({ ...base, to: [{ name: 'Bad <x>', address: 'a@example.com' }] })).toContain('to: Bad x <a@example.com>');
  });

  it('rejects invalid addresses, missing headers, and unknown commands', () => {
    expect(() => formatSendCommand({ ...base, to: [{ address: 'not-an-address' }] })).toThrow(/valid email/);
    expect(() => formatSendCommand({ ...base, from: 'nope' })).toThrow(/from address/);
    expect(() => formatSendCommand({ ...base, to: [] })).toThrow(/recipient/);
    expect(() => formatSendCommand({ ...base, body: '   ' })).toThrow(/body/);

    expect(() => parseCommand('/inbox-send v1\nfrom: demo@mail.grokbot.com\nto: a@example.com\nsubject: x\nhello')).toThrow(/---/);
    expect(() => parseCommand('/inbox-send v1\nto: a@example.com\nsubject: x\n---\nhello')).toThrow(/Missing header: from/);
    expect(() => parseCommand('/inbox-send v1\nfrom: demo@mail.grokbot.com\nto: a@example.com\nsubject: x\nto: b@example.com\n---\nhi')).toThrow(/Duplicate/);
    expect(() => parseCommand('/inbox-send v1\nfrom: demo@mail.grokbot.com\nto: a@example\nsubject: x\n---\nhi')).toThrow(/valid email/);
    expect(() => parseCommand('/inbox-send v1\nfrom: demo@mail.grokbot.com\nto: a@example.com\nsubject: x\nkind: bcc\n---\nhi')).toThrow(/kind/);
    expect(() => parseCommand('/inbox-send v1\nfrom: demo@mail.grokbot.com\nbcc: x@example.com\nto: a@example.com\nsubject: x\n---\nhi')).not.toThrow();
    expect(() => parseCommand('/inbox-delete v1\n---\n')).toThrow(/Unknown command/);
    expect(() => parseCommand('/inbox-send v1 extra')).toThrow(/first line/);
    expect(() => parseCommand('/inbox-send v1\nfrom: demo@mail.grokbot.com\nto: a@example.com\nsubject: x\n---\n\n')).toThrow(/body is empty/);
  });

  it('treats a stray carriage return inside a header as a line break', () => {
    expect(() => parseCommand('/inbox-send v1\nfrom: demo@mail.grokbot.com\nto: a@example.com\rcc: b@example.com\nsubject: x\n---\nhi')).toThrow(
      CommandError,
    );
  });
});

describe('recipients and addresses', () => {
  it('parses names, brackets, quotes, and separators', () => {
    expect(parseRecipients('Alice <alice@example.com>, bob@example.com; "Rossi, Bianca" <bianca@example.com>')).toEqual([
      { name: 'Alice', address: 'alice@example.com' },
      { address: 'bob@example.com' },
      { name: 'Rossi, Bianca', address: 'bianca@example.com' },
    ]);
  });

  it('validates addresses strictly enough', () => {
    expect(isValidAddress('demo+roma@mail.grokbot.com')).toBe(true);
    expect(isValidAddress('a@b')).toBe(false);
    expect(isValidAddress('a b@example.com')).toBe(false);
    expect(isValidAddress('<a@example.com>')).toBe(false);
    expect(isValidAddress('a@example.com\nbcc: x@example.com')).toBe(false);
  });
});

describe('refresh command', () => {
  it('formats with the inbox and parses with or without it', () => {
    expect(formatRefreshCommand('demo+roma@mail.grokbot.com')).toBe('/inbox-refresh v1\ninbox: demo+roma@mail.grokbot.com');
    expect(parseCommand('/inbox-refresh')).toEqual({ type: 'refresh', command: { version: 'v1' } });
    expect(parseCommand(formatRefreshCommand('demo+roma@mail.grokbot.com'))).toEqual({
      type: 'refresh',
      command: { version: 'v1', inbox: 'demo+roma@mail.grokbot.com' },
    });
    expect(() => parseCommand('/inbox-refresh v1\ninbox: nope')).toThrow(/inbox address/);
  });
});
