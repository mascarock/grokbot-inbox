import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import sample from '../examples/sample-inbox.json';
import { decodeInboxPayload, readLinkPayload } from './lib/linkCodec';
import { parseInboxExport } from './sources/parseExport';
import { createLinkSource } from './sources/linkSource';
import type { InboxExport } from './types/inbox';

const root = resolve(__dirname, '..');
const samplePath = resolve(root, 'examples/sample-inbox.json');
const pyScript = resolve(root, 'tools/make_link.py');
const mjsScript = resolve(root, 'tools/make_link.mjs');

interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
}

function run(cmd: string, args: string[]): RunResult {
  const result = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error) throw result.error;
  return { stdout: result.stdout, stderr: result.stderr, status: result.status ?? 1 };
}

async function openLink(link: string): Promise<InboxExport> {
  const url = new URL(link);
  const payload = readLinkPayload(url.hash);
  expect(payload).toBeTruthy();
  return createLinkSource(payload ?? '').load();
}

const expected = parseInboxExport(sample);

describe.each([
  ['python3', pyScript],
  ['node', mjsScript],
])('%s make_link', (runtime, script) => {
  it('prints a link that opens the same inbox in the app', async () => {
    const result = run(runtime, [script, samplePath, '--quiet']);
    expect(result.status, result.stderr).toBe(0);
    const link = result.stdout.trim();
    expect(link.startsWith('https://grokbot-inbox-mascarock.vercel.app/#data=')).toBe(true);
    expect(link).toMatch(/^[^\s]+$/);
    const inbox = await openLink(link);
    expect(inbox).toEqual(expected);
  });

  it('builds a lite link without quotes, HTML, inline images, or attachment bytes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'grokbot-inbox-'));
    const liteJson = join(dir, 'lite.json');
    const result = run(runtime, [script, samplePath, '--lite', '--write-json', liteJson, '--base', 'http://localhost:4173/']);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toMatch(/lite mode/);
    const link = result.stdout.trim();
    expect(link.startsWith('http://localhost:4173/#data=')).toBe(true);

    const inbox = await openLink(link);
    expect(inbox.mode).toBe('lite');
    expect(inbox.inbox).toBe(expected.inbox);
    expect(inbox.threads.map((t) => t.id)).toEqual(expected.threads.map((t) => t.id));

    const messages = inbox.threads.flatMap((t) => t.messages);
    expect(messages.every((m) => m.html === undefined)).toBe(true);
    expect(messages.flatMap((m) => m.attachments).every((a) => !a.inline && a.url === undefined)).toBe(true);
    const reply = messages.find((m) => m.id === 'm-tent-3');
    expect(reply?.text).toContain('Perfect — orange tent it is.');
    expect(reply?.text).not.toMatch(/wrote:/);
    const lunch = messages.find((m) => m.id === 'm-lunch-1');
    expect(lunch?.text).toContain('Saturday plate is vegetarian');
    expect(lunch?.text).not.toContain('<');

    const written = JSON.parse(readFileSync(liteJson, 'utf8')) as { mode?: string };
    expect(written.mode).toBe('lite');

    const full = run(runtime, [script, samplePath, '--quiet']).stdout.trim();
    expect(link.length).toBeLessThan(full.length);
  });

  it('refuses a link over --max-chars with exit code 3 and rejects non-exports with 2', () => {
    const tooBig = run(runtime, [script, samplePath, '--max-chars', '100', '--quiet']);
    expect(tooBig.status).toBe(3);
    expect(tooBig.stdout.trim()).toBe('');
    expect(tooBig.stderr).toMatch(/send the JSON file/);

    const dir = mkdtempSync(join(tmpdir(), 'grokbot-inbox-'));
    const notExport = join(dir, 'not-export.json');
    writeFileSync(notExport, JSON.stringify({ hello: 'world' }));
    const bad = run(runtime, [script, notExport, '--quiet']);
    expect(bad.status).toBe(2);
    expect(bad.stdout.trim()).toBe('');
  });
});

describe('README demo link', () => {
  it('opens the fictional sample', async () => {
    const readme = readFileSync(resolve(root, 'README.md'), 'utf8');
    const match = readme.match(/https:\/\/grokbot-inbox-mascarock\.vercel\.app\/#data=[A-Za-z0-9_-]+/);
    expect(match, 'README has a demo link').toBeTruthy();
    const inbox = await openLink(match?.[0] ?? '');
    expect(inbox).toEqual(expected);
    expect(decodeInboxPayload(readLinkPayload(new URL(match?.[0] ?? '').hash) ?? '')).toContain('demo+roma@mail.grokbot.com');
  });
});
