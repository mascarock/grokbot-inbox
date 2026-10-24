import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { listFiles, manifest } from './publish_files.mjs';

const script = resolve(__dirname, 'publish_files.mjs');
const dir = mkdtempSync(join(tmpdir(), 'publish-files-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

mkdirSync(join(dir, 'assets'));
mkdirSync(join(dir, 'api'));
writeFileSync(join(dir, 'index.html'), '<!doctype html>');
writeFileSync(join(dir, 'assets/index-abc.js'), 'console.log(1)');
writeFileSync(join(dir, 'api/relay.js'), 'export default () => {}');
writeFileSync(join(dir, 'inbox.enc'), '{"v":1}');
writeFileSync(join(dir, '.nojekyll'), '');
writeFileSync(join(dir, 'dist-manifest.json'), '{"commit":"x"}');
writeFileSync(join(dir, 'empty.txt'), '');

describe('publish_files', () => {
  it('lists the deploy set without .nojekyll, dist-manifest.json, or empty files', () => {
    expect(listFiles(dir)).toEqual(['api/relay.js', 'assets/index-abc.js', 'inbox.enc', 'index.html']);
  });

  it('manifest has sha1 and byte size per file', () => {
    const entry = manifest(dir).find((f) => f.file === 'assets/index-abc.js');
    expect(entry).toEqual({ file: 'assets/index-abc.js', sha: createHash('sha1').update('console.log(1)').digest('hex'), size: 14 });
  });

  it('CLI: manifest, list, and file as upload_file arguments', () => {
    const run = (args: string[]) => spawnSync('node', [script, ...args], { encoding: 'utf8' });
    const m = JSON.parse(run(['manifest', '--dir', dir]).stdout) as { file: string }[];
    expect(m.map((f) => f.file)).toEqual(listFiles(dir));
    expect(run(['list', '--dir', dir]).stdout.trim().split('\n')).toEqual(listFiles(dir));
    const one = JSON.parse(run(['file', '--dir', dir, '--path', 'inbox.enc']).stdout) as Record<string, unknown>;
    expect(one).toEqual({
      file: 'inbox.enc',
      xVercelDigest: createHash('sha1').update('{"v":1}').digest('hex'),
      contentLength: 7,
      requestBody: Buffer.from('{"v":1}').toString('base64'),
    });
    expect(run(['file', '--dir', dir]).status).toBe(1);
  });
});
