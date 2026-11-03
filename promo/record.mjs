/**
 * Records the fictional /?demo inbox for the promo.
 * Requires the app already running (see README). Writes capture/*.webm and *.json.
 */
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(fileURLToPath(import.meta.url));
const captureDir = path.join(root, 'capture');
const appUrl = process.env.PROMO_APP_URL ?? 'http://127.0.0.1:5173/?demo';

const CURSOR_SVG = `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M6.2 3.2 22.4 14.4 13.4 15.9 10.4 24.2 6.2 3.2Z" fill="#fafafa" stroke="#0a0a0a" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`;

async function installCursor(page) {
  await page.evaluate((svg) => {
    document.getElementById('promo-cursor')?.remove();
    const cursor = document.createElement('div');
    cursor.id = 'promo-cursor';
    cursor.innerHTML = svg;
    cursor.style.cssText = [
      'position:fixed',
      'left:-80px',
      'top:-80px',
      'z-index:100000',
      'pointer-events:none',
      'filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))',
      'will-change:left,top',
    ].join(';');
    document.body.appendChild(cursor);
  }, CURSOR_SVG);
}

async function placeCursor(page, x, y, scale = 1) {
  await page.evaluate(({ x, y, scale }) => {
    const cursor = document.getElementById('promo-cursor');
    if (!cursor) return;
    cursor.style.display = 'block';
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
    cursor.style.transform = `translate(-3px, -2px) scale(${scale})`;
  }, { x, y, scale });
}

async function hideCursor(page) {
  await page.evaluate(() => {
    const cursor = document.getElementById('promo-cursor');
    if (cursor) cursor.style.display = 'none';
  });
}

async function glide(page, from, to, ms = 480) {
  const steps = 14;
  for (let i = 1; i <= steps; i += 1) {
    const t = 1 - (1 - i / steps) ** 3;
    await placeCursor(page, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    await page.waitForTimeout(ms / steps);
  }
}

async function clickAt(page, locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Missing click target');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await placeCursor(page, x, y, 0.86);
  await page.waitForTimeout(70);
  await locator.click();
  await placeCursor(page, x, y, 1);
  return { x, y };
}

async function recordClip(browser, name, run) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'reduce',
    recordVideo: { dir: captureDir, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('grokbot-inbox-theme', 'dark');
    localStorage.setItem('grokbot-inbox-privacy-blur', '0');
  });
  const started = Date.now();
  const marks = [];
  const mark = (label) => {
    const ms = Date.now() - started;
    marks.push({ label, ms });
    console.log(`  ${name} ${label} @ ${ms}ms`);
  };
  try {
    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.read-head h1', { timeout: 20000 });
    await installCursor(page);
    await page.waitForTimeout(250);
    mark('ready');
    await run(page, mark);
    mark('end');
  } finally {
    const video = page.video();
    await context.close();
    const src = video ? await video.path() : '';
    const dest = path.join(captureDir, `${name}.webm`);
    if (src) await rename(src, dest);
    await writeFile(path.join(captureDir, `${name}.json`), JSON.stringify({ name, marks, appUrl }, null, 2));
    console.log(`wrote ${dest}`);
  }
}

async function viewer(page, mark) {
  await placeCursor(page, 280, 280);
  await page.waitForTimeout(1900);
  mark('beforeThread');
  const row = page.locator('.thread-open').nth(1);
  const box = await row.boundingBox();
  if (!box) throw new Error('thread row missing');
  await glide(page, { x: 280, y: 280 }, { x: box.x + 120, y: box.y + box.height / 2 }, 420);
  await clickAt(page, row);
  mark('openedThread');
  await page.waitForTimeout(1500);
  mark('beforePalette');
  await hideCursor(page);
  await page.keyboard.press('Control+k');
  await page.waitForSelector('.palette input');
  await page.waitForTimeout(280);
  await page.keyboard.type('lunch', { delay: 90 });
  mark('typedPalette');
  await page.waitForTimeout(900);
  await page.keyboard.press('Enter');
  await page.waitForSelector('.read-head h1');
  mark('paletteOpenedThread');
  await page.waitForTimeout(2200);
}

async function privacy(page, mark) {
  await placeCursor(page, 360, 320);
  await page.waitForTimeout(1100);
  mark('beforeBlur');
  const eye = page.locator('.sidebar .privacy-toggle');
  const box = await eye.boundingBox();
  if (!box) throw new Error('privacy toggle missing');
  await glide(page, { x: 360, y: 320 }, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 520);
  await clickAt(page, eye);
  await page.waitForSelector('html[data-privacy="on"]');
  mark('blurred');
  await page.waitForTimeout(2500);
}

async function reply(page, mark) {
  await hideCursor(page);
  await page.keyboard.press('r');
  const body = page.locator('.compose-body');
  await body.waitFor();
  mark('composeOpen');
  await body.click();
  await page.waitForTimeout(180);
  await page.keyboard.type('See you at the orange tent.', { delay: 46 });
  mark('typedReply');
  await page.waitForTimeout(1200);
}

const browser = await chromium.launch({ headless: true });
await mkdir(captureDir, { recursive: true });
try {
  console.log(`recording against ${appUrl}`);
  await recordClip(browser, 'viewer', viewer);
  await recordClip(browser, 'privacy', privacy);
  await recordClip(browser, 'reply', reply);
} finally {
  await browser.close();
}
