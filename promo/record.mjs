/**
 * Deterministic plates of the fictional /?demo inbox.
 * The stage plays these at 60fps and moves the camera itself, so nothing here
 * depends on wall-clock animation.
 *
 * Requires the app already running (see README).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(fileURLToPath(import.meta.url));
const platesDir = path.join(root, 'capture', 'plates');
const appUrl = process.env.PROMO_APP_URL ?? 'http://127.0.0.1:5173/?demo';

const REPLY = 'See you at the orange tent.';
const QUERY = 'lunch';
const BLUR_FRAMES = 42;

const INJECT = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
  .toast { display: none !important; }
  html .pii {
    filter: blur(calc(var(--promo-blur, 0) * 0.36em)) !important;
  }
`;

function easeOut(t) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

async function settle(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
  );
}

async function shot(page, name) {
  const file = path.join(platesDir, `${name}.png`);
  await page.screenshot({ path: file, type: 'png' });
  console.log('  plate', name);
  return `capture/plates/${name}.png`;
}

async function measure(page) {
  return page.evaluate(() => {
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        cx: r.x + r.width / 2,
        cy: r.y + r.height / 2,
      };
    };
    const rows = [...document.querySelectorAll('.thread-open')].map((el) => box(el));
    return {
      eye: box(document.querySelector('.sidebar .privacy-toggle')),
      rows,
      title: box(document.querySelector('.read-head h1')),
      palette: box(document.querySelector('.palette')),
      compose: box(document.querySelector('.compose-card')),
    };
  });
}

async function boot(page) {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.read-head h1', { timeout: 20000 });
  await page.addStyleTag({ content: INJECT });
  await page.evaluate(() => document.documentElement.style.setProperty('--promo-blur', '0'));
  await settle(page);
}

async function setField(page, selector, value) {
  await page.evaluate(
    ({ selector, value }) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`missing ${selector}`);
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      desc.set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    { selector, value },
  );
  await settle(page);
}

async function fresh(browser) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    locale: 'en-US',
    timezoneId: 'UTC',
  });
  await context.addInitScript(() => {
    localStorage.setItem('grokbot-inbox-theme', 'dark');
    localStorage.setItem('grokbot-inbox-privacy-blur', '0');
  });
  const page = await context.newPage();
  await boot(page);
  return { context, page };
}

const browser = await chromium.launch({ headless: true });
await mkdir(platesDir, { recursive: true });

const plates = { blur: [], palette: [], compose: [] };
let layout = {};

try {
  {
    const { context, page } = await fresh(browser);
    plates.list = await shot(page, 'list');
    layout = { ...(await measure(page)) };
    const row = page.locator('.thread-open').nth(1);
    await row.click();
    await page.waitForFunction(
      () => (document.querySelector('.read-head h1')?.textContent ?? '').includes('Badge'),
      { timeout: 8000 },
    );
    await settle(page);
    plates.thread = await shot(page, 'thread');
    layout.thread = await measure(page);
    await context.close();
  }

  {
    const { context, page } = await fresh(browser);
    await page.keyboard.press('Control+k');
    await page.waitForSelector('.palette input');
    await settle(page);
    for (let i = 0; i <= QUERY.length; i += 1) {
      await setField(page, '.palette input', QUERY.slice(0, i));
      const name = `palette-${i}`;
      plates.palette.push(await shot(page, name));
    }
    layout.palette = (await measure(page)).palette;
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => (document.querySelector('.read-head h1')?.textContent ?? '').toLowerCase().includes('lunch'),
      { timeout: 8000 },
    );
    await settle(page);
    plates.lunch = await shot(page, 'lunch');
    layout.lunch = await measure(page);
    await context.close();
  }

  {
    const { context, page } = await fresh(browser);
    const swap = 16;
    for (let i = 0; i < BLUR_FRAMES; i += 1) {
      if (i === swap) {
        await page.locator('.sidebar .privacy-toggle').click();
        await page.waitForSelector('html[data-privacy="on"]');
      }
      const blur =
        i <= swap
          ? easeOut(i / swap)
          : 1 - 0.42 * easeOut((i - swap) / (BLUR_FRAMES - 1 - swap));
      await page.evaluate((value) => {
        document.documentElement.style.setProperty('--promo-blur', String(value));
      }, blur);
      await settle(page);
      plates.blur.push(await shot(page, `blur-${String(i).padStart(2, '0')}`));
    }
    layout.eye = (await measure(page)).eye;
    await context.close();
  }

  {
    const { context, page } = await fresh(browser);
    await page.keyboard.press('r');
    await page.waitForSelector('.compose-body');
    await settle(page);
    for (let i = 0; i <= REPLY.length; i += 1) {
      await setField(page, '.compose-body', REPLY.slice(0, i));
      plates.compose.push(await shot(page, `compose-${String(i).padStart(2, '0')}`));
    }
    layout.compose = (await measure(page)).compose;
    await context.close();
  }
} finally {
  await browser.close();
}

const manifest = {
  fps: 60,
  reply: REPLY,
  query: QUERY,
  plates,
  layout,
};
await writeFile(path.join(root, 'capture', 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('wrote capture/manifest.json');
console.log(JSON.stringify(layout, null, 2));
