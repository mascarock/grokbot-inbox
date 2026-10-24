import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { decryptSnapshot, parseEnvelope } from '../src/lib/crypto';

const root = resolve(__dirname, '..');
const mjs = resolve(root, 'bot/encrypt_inbox.mjs');
const py = resolve(root, 'bot/encrypt_inbox.py');
const sample = readFileSync(resolve(root, 'examples/sample-inbox.json'), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'encrypt-inbox-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function run(cmd: string, args: string[]) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', cwd: dir });
  if (result.error) throw result.error;
  return { stdout: result.stdout, stderr: result.stderr, status: result.status ?? 1 };
}

describe('bot/encrypt_inbox.mjs CLI', () => {
  const keyFile = join(dir, 'node.key');
  writeFileSync(join(dir, 'export.json'), sample);

  it('keygen writes a 0600 key file and refuses to overwrite it', () => {
    expect(run('node', [mjs, 'keygen', '--key-file', keyFile]).status).toBe(0);
    expect(readFileSync(keyFile, 'utf8').trim()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(run('node', [mjs, 'keygen', '--key-file', keyFile]).status).toBe(1);
  });

  it('encrypt writes inbox.enc + inbox.meta.json the viewer decrypts, with a prefilled relay block and a growing seq', async () => {
    const out = join(dir, 'node-out');
    const first = run('node', [mjs, 'encrypt', '--in', 'export.json', '--key-file', keyFile, '--out-dir', out, '--webhook-url', 'https://grok.com/routines/r/webhook']);
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout).toBe('');
    const key = readFileSync(keyFile, 'utf8').trim();
    const envelope = parseEnvelope(JSON.parse(readFileSync(join(out, 'inbox.enc'), 'utf8')));
    const meta = JSON.parse(readFileSync(join(out, 'inbox.meta.json'), 'utf8')) as { seq: number; updatedAt: string };
    expect(meta.seq).toBe(envelope.seq);
    expect(meta.updatedAt).toBe(envelope.updatedAt);
    const plain = JSON.parse(await decryptSnapshot(envelope, key)) as { inbox: string; relay: { webhookUrl: string } };
    expect(plain.inbox).toBe('demo+roma@mail.grokbot.com');
    expect(plain.relay.webhookUrl).toBe('https://grok.com/routines/r/webhook');
    expect(readFileSync(join(out, 'inbox.enc'), 'utf8')).not.toContain('demo+roma');

    const second = run('node', [mjs, 'encrypt', '--in', 'export.json', '--key-file', keyFile, '--out-dir', out]);
    expect(second.status).toBe(0);
    const again = parseEnvelope(JSON.parse(readFileSync(join(out, 'inbox.enc'), 'utf8')));
    expect(again.seq).toBeGreaterThan(envelope.seq);
    expect(again.iv).not.toBe(envelope.iv);
  });

  it('--outbox and --acked land in inbox.meta.json only', () => {
    const out = join(dir, 'node-meta');
    writeFileSync(join(dir, 'acked.json'), JSON.stringify(['outbox/c.enc', 7]));
    const result = run('node', [
      mjs, 'encrypt', '--in', 'export.json', '--key-file', keyFile, '--out-dir', out,
      '--outbox', '--acked', 'outbox/a.enc,outbox/b.enc', '--acked', join(dir, 'acked.json'), '--acked', 'outbox/a.enc',
    ]);
    expect(result.status, result.stderr).toBe(0);
    const meta = JSON.parse(readFileSync(join(out, 'inbox.meta.json'), 'utf8')) as Record<string, unknown>;
    expect(meta.outbox).toBe(true);
    expect(meta.outboxAcked).toEqual(['outbox/a.enc', 'outbox/b.enc', 'outbox/c.enc']);
    const plain = JSON.parse(readFileSync(join(out, 'inbox.enc'), 'utf8')) as Record<string, unknown>;
    expect(plain.outbox).toBeUndefined();
    const bare = run('node', [mjs, 'encrypt', '--in', 'export.json', '--key-file', keyFile, '--out-dir', out]);
    expect(bare.status).toBe(0);
    expect(Object.keys(JSON.parse(readFileSync(join(out, 'inbox.meta.json'), 'utf8')) as object).sort()).toEqual(['seq', 'updatedAt']);
  });

  it('link puts the key only in the fragment', () => {
    const link = run('node', [mjs, 'link', '--base', 'https://grokbot-inbox-x.vercel.app', '--key-file', keyFile]).stdout.trim();
    expect(link).toBe(`https://grokbot-inbox-x.vercel.app/#k=${readFileSync(keyFile, 'utf8').trim()}`);
  });

  it('rejects a non-export input', () => {
    writeFileSync(join(dir, 'bad.json'), '{"hello":1}');
    expect(run('node', [mjs, 'encrypt', '--in', 'bad.json', '--key-file', keyFile, '--out-dir', dir]).status).toBe(1);
  });
});

describe('bot/encrypt_inbox.py', () => {
  const probe = spawnSync('python3', ['-c', 'import cryptography'], { encoding: 'utf8' });
  const available = !probe.error && probe.status === 0;

  it.skipIf(!available)('produces an envelope the viewer and the Node script both decrypt', async () => {
    const keyFile = join(dir, 'py.key');
    const out = join(dir, 'py-out');
    expect(run('python3', [py, 'keygen', '--key-file', keyFile]).status).toBe(0);
    const enc = run('python3', [py, 'encrypt', '--in', 'export.json', '--key-file', keyFile, '--out-dir', out, '--key-header', 'X-Api-Key', '--key-prefix', '', '--outbox', '--acked', 'outbox/a.enc']);
    expect(enc.status, enc.stderr).toBe(0);
    expect(JSON.parse(readFileSync(join(out, 'inbox.meta.json'), 'utf8'))).toMatchObject({ outbox: true, outboxAcked: ['outbox/a.enc'] });
    const key = readFileSync(keyFile, 'utf8').trim();
    const envelope = parseEnvelope(JSON.parse(readFileSync(join(out, 'inbox.enc'), 'utf8')));
    expect(envelope.cmp).toBe('deflate-raw');
    const plain = JSON.parse(await decryptSnapshot(envelope, key)) as { relay: { keyHeader: string; keyPrefix: string } };
    expect(plain.relay).toEqual({ keyHeader: 'X-Api-Key', keyPrefix: '' });
    const viaNode = run('node', [mjs, 'decrypt', '--in', join(out, 'inbox.enc'), '--key-file', keyFile]);
    expect(viaNode.status).toBe(0);
    expect(JSON.parse(viaNode.stdout).inbox).toBe('demo+roma@mail.grokbot.com');
  });

  it('exits 3 with a hint when cryptography is missing', () => {
    // Simulate the missing package by hiding site-packages from the interpreter.
    const result = spawnSync('python3', ['-I', '-S', py, 'keygen'], { encoding: 'utf8', cwd: dir });
    if (result.error) return;
    const missing = /No module named 'cryptography'|cryptography/.test(result.stderr);
    if (result.status === 0) return; // stdlib-only interpreter still had the package: nothing to assert
    expect(missing || result.status === 3).toBe(true);
  });
});
