/**
 * 60fps H.264 promo. Playwright screenshots the stage; ffmpeg encodes.
 * Optional soft ticks and whooshes are synthesized here (no licensed music).
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { CUES, DURATION, FPS } from './stage/timeline.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(root, 'out');
const FRAMES = DURATION * FPS;
const only = process.argv.find((arg) => arg.startsWith('--only='))?.split('=')[1] ?? 'both';

function run(cmd, args, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: [stdin ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve(child) : reject(new Error(`${cmd} exited ${code}`))));
    if (stdin) stdin(child.stdin);
  });
}

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const file = path.resolve(root, rel);
      if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': contentType(file), 'Cache-Control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, port: typeof address === 'object' && address ? address.port : 0 });
    });
  });
}

function openEncoder(output) {
  return spawn(
    'ffmpeg',
    [
      '-y',
      '-f', 'image2pipe',
      '-framerate', String(FPS),
      '-i', '-',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-crf', '16',
      '-preset', 'medium',
      '-movflags', '+faststart',
      '-an',
      output,
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );
}

function writeFrame(encoder, buffer) {
  return new Promise((resolve, reject) => {
    const ok = encoder.stdin.write(buffer, (error) => {
      if (error) reject(error);
    });
    if (ok) resolve();
    else encoder.stdin.once('drain', resolve);
  });
}

async function renderPass(page, mode, output, posterAt) {
  const width = mode === 'vertical' ? 1080 : 1920;
  const height = mode === 'vertical' ? 1920 : 1080;
  await page.setViewportSize({ width, height });
  const encoder = openEncoder(output);
  let poster = null;
  const failures = [];
  for (let frame = 0; frame < FRAMES; frame += 1) {
    const t = frame / FPS;
    await page.evaluate((payload) => window.renderFrame(payload), { t, mode });
    const settled = await page.evaluate(() => window.settleFrame());
    if (settled.some((ok) => !ok)) failures.push(frame);
    const buffer = await page.screenshot({ type: 'png' });
    if (posterAt != null && frame === posterAt) poster = buffer;
    await writeFrame(encoder, buffer);
    if (frame % FPS === 0) console.log(`  ${mode} ${frame}/${FRAMES}`);
  }
  encoder.stdin.end();
  await new Promise((resolve, reject) => {
    encoder.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`encode failed ${code}`))));
  });
  if (failures.length) console.warn(`${mode} had ${failures.length} image load failures, first at frame ${failures[0]}`);
  return poster;
}

async function synth(file, args) {
  await run('ffmpeg', ['-y', ...args, file]);
}

async function mixAudio(bed) {
  const tick = path.join(outDir, 'tick.wav');
  const whoosh = path.join(outDir, 'whoosh.wav');
  await synth(tick, [
    '-f', 'lavfi', '-i', 'sine=frequency=1320:duration=0.045:sample_rate=48000',
    '-af', 'afade=t=in:st=0:d=0.004,afade=t=out:st=0.012:d=0.03,volume=0.45',
  ]);
  await synth(whoosh, [
    '-f', 'lavfi', '-i', 'sine=frequency=150:duration=0.2:sample_rate=48000',
    '-f', 'lavfi', '-i', 'anoisesrc=color=pink:duration=0.2:sample_rate=48000',
    '-filter_complex',
    '[0]afade=t=in:st=0:d=0.008,afade=t=out:st=0.03:d=0.16,volume=0.4[s];[1]highpass=f=600,lowpass=f=1800,afade=t=in:st=0:d=0.02,afade=t=out:st=0.04:d=0.15,volume=0.12[n];[s][n]amix=inputs=2:normalize=0:duration=first',
  ]);
  const delays = CUES.map((cue, index) => {
    const src = cue.kind === 'tick' ? tick : whoosh;
    const ms = Math.round(cue.t * 1000);
    return { src, ms, index };
  });
  const inputs = ['-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo:d=${DURATION}`];
  delays.forEach((cue) => inputs.push('-i', cue.src));
  const labels = delays.map((cue) => {
    const gain = cue.src === tick ? 0.55 : 0.7;
    return `[${cue.index + 1}]adelay=${cue.ms}|${cue.ms},volume=${gain}[c${cue.index}]`;
  });
  const mixIns = ['[0]', ...delays.map((cue) => `[c${cue.index}]`)].join('');
  const filter = `${labels.join(';')};${mixIns}amix=inputs=${delays.length + 1}:normalize=0:duration=first,volume=0.9`;
  await run('ffmpeg', ['-y', ...inputs, '-filter_complex', filter, '-c:a', 'pcm_s16le', bed]);
}

async function mux(video, audio, dest) {
  await run('ffmpeg', ['-y', '-i', video, '-i', audio, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', dest]);
}

const manifestPath = path.join(root, 'capture', 'manifest.json');
await readFile(manifestPath);

const { server, port } = await startServer();
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${port}/stage/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.renderFrame === 'function');
await page.evaluate(async (url) => {
  window.__manifest = await (await fetch(url)).json();
}, '/capture/manifest.json');

const silent = {
  landscape: path.join(outDir, 'silent-landscape.mp4'),
  vertical: path.join(outDir, 'silent-vertical.mp4'),
};
const final = {
  landscape: path.join(outDir, 'grokbot-inbox-promo.mp4'),
  vertical: path.join(outDir, 'grokbot-inbox-promo-vertical.mp4'),
};

try {
  if (only === 'both' || only === 'landscape') {
    const poster = await renderPass(page, 'landscape', silent.landscape, Math.round(28.4 * FPS));
    if (poster) await writeFile(path.join(outDir, 'poster.png'), poster);
  }
  if (only === 'both' || only === 'vertical') {
    await renderPass(page, 'vertical', silent.vertical, null);
  }
} finally {
  await browser.close();
  server.close();
}

const bed = path.join(outDir, 'bed.wav');
await mixAudio(bed);
for (const key of ['landscape', 'vertical']) {
  if (await stat(silent[key]).then(() => true).catch(() => false)) {
    await mux(silent[key], bed, final[key]);
  }
}

if (await stat(final.landscape).then(() => true).catch(() => false)) {
  await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size', '-show_streams', '-of', 'json', final.landscape]);
}
if (await stat(final.vertical).then(() => true).catch(() => false)) {
  await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=width,height,avg_frame_rate,codec_name', '-of', 'json', final.vertical]);
}
