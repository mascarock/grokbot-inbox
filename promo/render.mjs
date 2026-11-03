/**
 * Composes capture/*.webm into a 30s 1080p H.264 promo, plus a vertical cut.
 * Frame-accurate: Playwright screenshots the stage, ffmpeg encodes.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readdir, readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(fileURLToPath(import.meta.url));
const captureDir = path.join(root, 'capture');
const outDir = path.join(root, 'out');
const FPS = 30;
const FRAMES = 30 * FPS;

const only = process.argv.find((arg) => arg.startsWith('--only='))?.split('=')[1] ?? 'both';

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
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

async function extractFrames(name) {
  const dir = path.join(captureDir, 'frames', name);
  await mkdir(dir, { recursive: true });
  await run('ffmpeg', ['-y', '-i', path.join(captureDir, `${name}.webm`), '-vf', `fps=${FPS}`, path.join(dir, '%04d.png')]);
  const files = (await readdir(dir)).filter((file) => file.endsWith('.png'));
  return files.length;
}

function marksByLabel(marks) {
  return Object.fromEntries(marks.map((mark) => [mark.label, mark.ms]));
}

async function loadClip(name) {
  const json = JSON.parse(await readFile(path.join(captureDir, `${name}.json`), 'utf8'));
  const frameCount = await extractFrames(name);
  const marks = marksByLabel(json.marks);
  if (marks.ready == null) throw new Error(`${name} is missing the ready mark`);
  return { readyMs: marks.ready, frameCount, marks };
}

function openEncoder(output, width, height) {
  const child = spawn(
    'ffmpeg',
    [
      '-y',
      '-f',
      'image2pipe',
      '-framerate',
      String(FPS),
      '-i',
      '-',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      '17',
      '-preset',
      'medium',
      '-movflags',
      '+faststart',
      '-an',
      output,
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );
  return child;
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

async function renderPass(page, mode, clips, output, posterAt) {
  const width = mode === 'vertical' ? 1080 : 1920;
  const height = mode === 'vertical' ? 1920 : 1080;
  await page.setViewportSize({ width, height });
  const encoder = openEncoder(output, width, height);
  let poster = null;
  const failures = [];
  for (let frame = 0; frame < FRAMES; frame += 1) {
    const t = frame / FPS;
    await page.evaluate((payload) => window.renderFrame(payload), { t, mode, clips });
    const settled = await page.evaluate(() => window.settleFrame());
    if (settled.some((ok) => !ok)) failures.push(frame);
    const buffer = await page.screenshot({ type: 'png' });
    if (posterAt != null && frame === posterAt) poster = buffer;
    await writeFrame(encoder, buffer);
    if (frame % 30 === 0) console.log(`  ${mode} ${frame}/${FRAMES}`);
  }
  encoder.stdin.end();
  await new Promise((resolve, reject) => {
    encoder.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`encode failed ${code}`))));
  });
  if (failures.length) console.warn(`${mode} had ${failures.length} image load failures, first at frame ${failures[0]}`);
  return poster;
}

const { server, port } = await startServer();
await mkdir(outDir, { recursive: true });
const clips = {
  viewer: await loadClip('viewer'),
  privacy: await loadClip('privacy'),
  reply: await loadClip('reply'),
};
await writeFile(path.join(outDir, 'clips.json'), JSON.stringify(clips, null, 2));
console.log(JSON.stringify(clips, null, 2));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${port}/stage/index.html`, { waitUntil: 'domcontentloaded' });

try {
  if (only === 'both' || only === 'landscape') {
    const poster = await renderPass(page, 'landscape', clips, path.join(outDir, 'grokbot-inbox-promo.mp4'), Math.round(28.7 * FPS));
    if (poster) await writeFile(path.join(outDir, 'poster.png'), poster);
  }
  if (only === 'both' || only === 'vertical') {
    await renderPass(page, 'vertical', clips, path.join(outDir, 'grokbot-inbox-promo-vertical.mp4'), null);
  }
} finally {
  await browser.close();
  server.close();
}

const landscape = path.join(outDir, 'grokbot-inbox-promo.mp4');
if (await stat(landscape).then(() => true).catch(() => false)) {
  await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size', '-show_streams', '-of', 'json', landscape]);
}
