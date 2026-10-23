#!/usr/bin/env node
// Node equivalent of make_link.py. No dependencies beyond node:zlib.
//
//   node make_link.mjs export.json --base https://grokbot-inbox-<handle>.vercel.app/ [--lite] [--max-chars N] [--write-json PATH] [--quiet]
//
// Output and exit codes match the Python script. See docs/LINK.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';

// There is no central viewer. Each bot deploys its owner's own copy and must
// pass --base <that URL>. This default is the demo/fallback deployment only.
const DEFAULT_BASE = 'https://grokbot-inbox-mascarock.vercel.app/';
const DEFAULT_MAX_CHARS = 1_900_000;

const QUOTE_START = /^On .+ wrote:\s*$/i;
const ORIGINAL_MESSAGE = /^-{2,}\s*Original Message\s*-{2,}\s*$/i;
const FORWARDED = /^Begin forwarded message:\s*$/i;

export function encodePayload(bytes) {
  return deflateRawSync(bytes, { level: 9 }).toString('base64url');
}

export function buildLink(base, doc) {
  const compact = Buffer.from(JSON.stringify(doc), 'utf8');
  const payload = encodePayload(compact);
  return { link: `${base.split('#')[0]}#data=${payload}`, jsonBytes: compact.length, payloadChars: payload.length };
}

export function stripQuotedReply(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const cut = findQuoteStart(lines);
  return cut < 0 ? text : lines.slice(0, cut).join('\n').replace(/\n+$/, '');
}

function findQuoteStart(lines) {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (QUOTE_START.test(trimmed) || ORIGINAL_MESSAGE.test(trimmed) || FORWARDED.test(trimmed)) return i;
    if (/^From:\s+\S/.test(trimmed) && lines.slice(i + 1, i + 4).some((l) => /^(Sent|Date|To|Subject):\s*/.test(l.trim()))) {
      return i;
    }
    if (line.startsWith('>') && lines.slice(i).every((l) => l.trim() === '' || l.trimStart().startsWith('>'))) return i;
  }
  return -1;
}

export function htmlToText(markup) {
  return markup
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

export function makeLite(doc) {
  const threads = (Array.isArray(doc.threads) ? doc.threads : []).filter((t) => t && typeof t === 'object');
  return {
    ...doc,
    mode: 'lite',
    threads: threads.map((thread) => ({
      ...thread,
      messages: (Array.isArray(thread.messages) ? thread.messages : [])
        .filter((m) => m && typeof m === 'object')
        .map((message) => {
          const out = { ...message };
          let text = out.text;
          if ((typeof text !== 'string' || !text.trim()) && typeof out.html === 'string' && out.html.trim()) {
            text = htmlToText(out.html);
          }
          if (typeof text === 'string') out.text = stripQuotedReply(text);
          delete out.html;
          out.attachments = (Array.isArray(out.attachments) ? out.attachments : [])
            .filter((a) => a && typeof a === 'object' && a.inline !== true)
            .map((a) => {
              const copy = { ...a };
              delete copy.url;
              return copy;
            });
          return out;
        }),
    })),
  };
}

function loadExport(path) {
  const raw = readFileSync(path === '-' ? 0 : path, 'utf8').replace(/^\uFEFF/, '').trim();
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  let text = fenced ? fenced[1].trim() : raw;
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('make_link: input is not valid JSON');
    doc = JSON.parse(text.slice(start, end + 1));
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || !Array.isArray(doc.threads)) {
    throw new Error('make_link: input is not an inbox export (expected an object with a "threads" array)');
  }
  return doc;
}

function parseArgs(argv) {
  const args = { export: null, lite: false, base: null, maxChars: DEFAULT_MAX_CHARS, writeJson: null, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--lite') args.lite = true;
    else if (arg === '--quiet') args.quiet = true;
    else if (arg === '--base') args.base = argv[++i];
    else if (arg === '--max-chars') args.maxChars = Number(argv[++i]);
    else if (arg === '--write-json') args.writeJson = argv[++i];
    else if (arg === '-h' || arg === '--help') {
      console.log('usage: make_link.mjs <export.json|-> [--lite] [--base URL] [--max-chars N] [--write-json PATH] [--quiet]');
      process.exit(0);
    } else if (!args.export) args.export = arg;
    else throw new Error(`make_link: unexpected argument ${arg}`);
  }
  if (!args.export) throw new Error('make_link: missing export path');
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let doc;
  try {
    doc = loadExport(args.export);
  } catch (err) {
    console.error(err.message);
    return 2;
  }
  if (args.lite) doc = makeLite(doc);
  if (args.writeJson) writeFileSync(args.writeJson, `${JSON.stringify(doc, null, 2)}\n`);
  const base = args.base || DEFAULT_BASE;
  if (!args.base && !args.quiet) console.error(`make_link: no --base given; using the demo viewer ${DEFAULT_BASE}`);
  const { link, jsonBytes, payloadChars } = buildLink(base, doc);
  if (!args.quiet) {
    const messages = doc.threads.reduce((n, t) => n + (Array.isArray(t.messages) ? t.messages.length : 0), 0);
    console.error(
      `make_link: ${doc.threads.length} threads, ${messages} messages, ${args.lite ? 'lite' : 'full'} mode; ` +
        `JSON ${jsonBytes.toLocaleString()} bytes -> payload ${payloadChars.toLocaleString()} chars -> link ${link.length.toLocaleString()} chars`,
    );
  }
  if (args.maxChars && link.length > args.maxChars) {
    console.error(
      `make_link: link is ${link.length.toLocaleString()} chars, over the ${args.maxChars.toLocaleString()} limit. ` +
        (args.lite ? '' : 'Try --lite, or ') +
        'send the JSON file instead and drop it on the viewer.',
    );
    return 3;
  }
  console.log(link);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
