#!/usr/bin/env node
/**
 * publish_files.mjs — prepare a publish directory for the Vercel connector.
 * Node 20+, no dependencies. See bot/SKILL.md Part E4.
 *
 * The connector cannot inline a dozen files in one create_deployment call,
 * so each file is uploaded first with `upload_file` (base64 content, sha1,
 * size) and the deployment then lists `{ file, sha, size }` entries.
 *
 *   node publish_files.mjs manifest --dir /tmp/publish
 *       → JSON array for create_deployment's "files": [{ file, sha, size }]
 *   node publish_files.mjs file --dir /tmp/publish --path assets/index-XXXX.js
 *       → JSON for one upload_file call: { file, sha, size, contentBase64 }
 *   node publish_files.mjs list --dir /tmp/publish
 *       → one relative path per line (the deploy set, after skips)
 *
 * Skipped: `.nojekyll` (GitHub Pages only), `dist-manifest.json` (cache
 * bookkeeping), dotfiles and anything the Vercel build would never serve.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const SKIP = new Set(['.nojekyll', 'dist-manifest.json', '.DS_Store']);

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[arg.slice(2)] = true;
      else {
        out[arg.slice(2)] = next;
        i++;
      }
    } else out._.push(arg);
  }
  return out;
}

export function listFiles(dir) {
  const files = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = relative(dir, full).split(sep).join('/');
      if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
      if (statSync(full).size === 0) continue;
      files.push(rel);
    }
  };
  walk(dir);
  return files.sort();
}

export function describe(dir, rel) {
  const bytes = readFileSync(join(dir, rel));
  return {
    file: rel,
    sha: createHash('sha1').update(bytes).digest('hex'),
    size: bytes.length,
    bytes,
  };
}

export function manifest(dir) {
  return listFiles(dir).map((rel) => {
    const { file, sha, size } = describe(dir, rel);
    return { file, sha, size };
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  const dir = args.dir ?? '/tmp/publish';

  if (command === 'manifest') {
    process.stdout.write(`${JSON.stringify(manifest(dir), null, 2)}\n`);
    return;
  }
  if (command === 'list') {
    process.stdout.write(listFiles(dir).map((f) => `${f}\n`).join(''));
    return;
  }
  if (command === 'file') {
    if (!args.path) {
      console.error('publish_files: --path <relative file> is required');
      process.exit(1);
    }
    const { file, sha, size, bytes } = describe(dir, args.path);
    process.stdout.write(`${JSON.stringify({ file, sha, size, contentBase64: bytes.toString('base64') })}\n`);
    return;
  }
  console.error('usage: publish_files.mjs manifest|list|file [--dir DIR] [--path FILE]');
  process.exit(2);
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) main();
