import Ajv from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import sample from '../examples/sample-inbox.json';
import schema from '../schema/inbox.schema.json';
import { threadAddresses } from './lib/addresses';
import { filterThreads } from './lib/filterThreads';
import { parseInboxExport } from './sources/parseExport';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const ALLOWED_HOST = /@(example\.com|mail\.grokbot\.com)$/i;

describe('sample inbox', () => {
  it('validates against the published schema', () => {
    const valid = validate(sample);
    expect(validate.errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('is a fictional roma inbox the viewer can browse', () => {
    const inbox = parseInboxExport(sample);
    expect(inbox.inbox).toBe('demo+roma@mail.grokbot.com');
    expect(inbox.threads.length).toBeGreaterThan(1);

    const addresses = inbox.threads.flatMap(threadAddresses);
    expect(addresses).toContain('alice@example.com');
    expect(addresses.every((address) => ALLOWED_HOST.test(address))).toBe(true);

    const serialized = JSON.stringify(sample).toLowerCase();
    expect(serialized).not.toContain('gmail.com');
    expect(serialized).not.toContain('niccolo');
    expect(serialized).not.toContain('mascarock');

    const bare = inbox.threads
      .flatMap((thread) => thread.messages)
      .find((message) => message.from.address === 'marco@example.com');
    expect(bare?.from.name).toBeUndefined();

    const textOnly = inbox.threads
      .flatMap((thread) => thread.messages)
      .find((message) => message.text && !message.html);
    expect(textOnly).toBeTruthy();

    const withReplySubject = inbox.threads.find((thread) => thread.subject.startsWith('Re:'));
    expect(withReplySubject).toBeTruthy();

    const inline = inbox.threads
      .flatMap((thread) => thread.messages)
      .flatMap((message) => message.attachments)
      .filter((attachment) => attachment.inline);
    expect(inline.length).toBeGreaterThan(1);

    expect(filterThreads(inbox.threads, { query: '', direction: 'all', tag: 'paris' }).map((thread) => thread.id)).toEqual([
      'th-paris',
    ]);
    expect(filterThreads(inbox.threads, { query: '', direction: 'sent', tag: null }).every((thread) =>
      thread.messages.some((message) => message.direction === 'sent'),
    )).toBe(true);
  });
});
