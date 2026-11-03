import { SCENES } from './timeline.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const easeInOut = (t) => {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2;
};

const LOGO = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">
  <rect x="1" y="1" width="30" height="30" rx="8" fill="#19191c" stroke="rgba(255,255,255,0.16)"/>
  <path d="M8 12.5h16v9H8z" fill="none" stroke="#fafafa" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="m8.5 13 7.5 5.2 7.5-5.2" fill="none" stroke="#fafafa" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`;

const CURSOR = `<svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true">
  <path d="M6.2 3.2 22.4 14.4 13.4 15.9 10.4 24.2 6.2 3.2Z" fill="#fafafa" stroke="#0a0a0a" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`;

function fadeWindow(t, start, end, fadeIn = 0.26, fadeOut = 0.26) {
  if (t < start || t >= end) return 0;
  let opacity = 1;
  if (t < start + fadeIn) opacity = easeInOut((t - start) / fadeIn);
  if (fadeOut > 0 && t > end - fadeOut) opacity = Math.min(opacity, 1 - easeInOut((t - (end - fadeOut)) / fadeOut));
  return opacity;
}

function mix(t, a, b) {
  if (t <= a) return 0;
  if (t >= b) return 1;
  return easeInOut((t - a) / (b - a));
}

function sample(t, keys, vertical) {
  const point = (key) => ({
    fx: vertical && key.fxv != null ? key.fxv : key.fx,
    fy: vertical && key.fyv != null ? key.fyv : key.fy,
    s: vertical ? key.sv : key.s,
  });
  if (t <= keys[0].t) return point(keys[0]);
  if (t >= keys[keys.length - 1].t) return point(keys[keys.length - 1]);
  for (let i = 0; i < keys.length - 1; i += 1) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t >= a.t && t <= b.t) {
      const u = easeInOut((t - a.t) / (b.t - a.t));
      const pa = point(a);
      const pb = point(b);
      return { fx: lerp(pa.fx, pb.fx, u), fy: lerp(pa.fy, pb.fy, u), s: lerp(pa.s, pb.s, u) };
    }
  }
  return point(keys[0]);
}

/** Keep a scaled 1920×1080 plate covering the view, biased toward (fx, fy). */
function cover(fx, fy, s, viewW, viewH) {
  const sw = 1920 * s;
  const sh = 1080 * s;
  const tx = clamp(viewW / 2 - fx * s, viewW - sw, 0);
  const ty = clamp(viewH / 2 - fy * s, viewH - sh, 0);
  return { tx, ty, s };
}

const VIEWER_CAM = [
  { t: 5.86, fx: 520, fy: 420, fxv: 230, fyv: 400, s: 1.08, sv: 1.62 },
  { t: 7.4, fx: 620, fy: 390, fxv: 250, fyv: 380, s: 1.14, sv: 1.66 },
  { t: 8.25, fx: 1020, fy: 300, fxv: 900, fyv: 280, s: 1.22, sv: 1.44 },
  { t: 10.95, fx: 1040, fy: 310, fxv: 920, fyv: 290, s: 1.24, sv: 1.42 },
  { t: 12.35, fx: 960, fy: 260, fxv: 960, fyv: 250, s: 1.38, sv: 1.5 },
  { t: 13.0, fx: 780, fy: 340, fxv: 840, fyv: 320, s: 1.14, sv: 1.4 },
  { t: 14.02, fx: 820, fy: 360, fxv: 860, fyv: 340, s: 1.16, sv: 1.42 },
];

const LATER_CAM = [
  { t: 16.42, fx: 480, fy: 380, fxv: 220, fyv: 360, s: 1.12, sv: 1.6 },
  { t: 18.5, fx: 540, fy: 360, fxv: 240, fyv: 340, s: 1.26, sv: 1.68 },
  { t: 19.92, fx: 540, fy: 360, fxv: 240, fyv: 340, s: 1.26, sv: 1.68 },
  { t: 20.5, fx: 1580, fy: 820, fxv: 1620, fyv: 860, s: 1.42, sv: 1.4 },
  { t: 23.22, fx: 1600, fy: 840, fxv: 1640, fyv: 880, s: 1.46, sv: 1.42 },
];

function reveal(text, t, start, end, size, weight = 600, extra = '') {
  const inn = easeOut((t - start) / 0.2);
  const out = t > end - 0.18 ? easeOut((end - t) / 0.18) : 1;
  const shown = t >= start && t < end;
  if (!shown || inn <= 0 || out <= 0) return '';
  return `<div style="overflow:hidden;${extra}">
    <div style="font-weight:${weight};font-size:${size}px;letter-spacing:-0.038em;line-height:1.08;transform:translateY(${(1 - inn) * 110}%);opacity:${Math.min(1, inn) * out}">${text}</div>
  </div>`;
}

function kicker(text, t, start, opacity) {
  const inn = easeOut((t - start) / 0.16);
  if (inn <= 0) return '';
  return `<div class="kicker" style="opacity:${inn * opacity};transform:translateY(${(1 - inn) * 8}px)">${text}</div>`;
}

function plateStack(items, cam, view, cursor) {
  const { tx, ty, s } = cover(cam.fx, cam.fy, cam.s, view.w, view.h);
  const imgs = items
    .filter((item) => item.opacity > 0.004)
    .map(
      (item) =>
        `<img alt="" src="/${item.src}" style="position:absolute;left:0;top:0;width:1920px;height:1080px;opacity:${item.opacity}" />`,
    )
    .join('');
  let pointer = '';
  if (cursor && cursor.opacity > 0.01) {
    const press = cursor.press ?? 1;
    pointer = `<div style="position:absolute;left:${cursor.x}px;top:${cursor.y}px;opacity:${cursor.opacity};transform:translate(-3px,-2px) scale(${press / s});transform-origin:6px 3px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.55))">${CURSOR}</div>`;
    if (cursor.ripple > 0 && cursor.ripple < 1) {
      const r = (16 + cursor.ripple * 34) / s;
      pointer += `<div style="position:absolute;left:${cursor.x + 6}px;top:${cursor.y + 4}px;width:${r}px;height:${r}px;margin:-${r / 2}px 0 0 -${r / 2}px;border-radius:999px;border:1.5px solid rgba(255,255,255,${0.4 * (1 - cursor.ripple)})"></div>`;
    }
  }
  return `<div style="position:absolute;left:${view.x}px;top:${view.y}px;width:${view.w}px;height:${view.h}px;overflow:hidden;border-radius:${view.radius}px;box-shadow:${view.shadow}">
    <div style="width:1920px;height:1080px;transform:translate(${tx}px,${ty}px) scale(${s});transform-origin:0 0">
      ${imgs}${pointer}
    </div>
  </div>`;
}

function cursorTravel(t, from, to, a, b) {
  const u = easeOut((t - a) / (b - a));
  const arc = Math.sin(clamp(u, 0, 1) * Math.PI) * 18;
  return {
    x: lerp(from.x, to.x, u) + arc * 0.35,
    y: lerp(from.y, to.y, u) - arc,
    opacity: fadeWindow(t, a - 0.05, b + 1.6, 0.12, 0.2),
  };
}

function clickPress(t, at) {
  if (t < at || t > at + 0.14) return 1;
  const u = (t - at) / 0.14;
  return u < 0.35 ? lerp(1, 0.84, u / 0.35) : lerp(0.84, 1, (u - 0.35) / 0.65);
}

function ripple(t, at) {
  if (t < at || t > at + 0.32) return 0;
  return easeOut((t - at) / 0.32);
}

function scrim(opacity) {
  return `<div style="position:absolute;left:0;right:0;bottom:0;height:240px;background:linear-gradient(to top, rgba(0,0,0,${0.62 * opacity}), transparent);pointer-events:none"></div>`;
}

function hook(t, mode) {
  const [a, b] = SCENES.hook;
  const opacity = fadeWindow(t, a, b, 0.18, 0.2);
  if (!opacity) return '';
  const vertical = mode === 'vertical';
  const size = vertical ? 64 : 76;
  const align = vertical ? 'center' : 'flex-start';
  const pad = vertical ? '0 72px' : '0 120px';
  const textAlign = vertical ? 'center' : 'left';
  return `<section class="layer" style="display:flex;align-items:center;justify-content:${align};padding:${pad};opacity:${opacity};text-align:${textAlign}">
    <div style="max-width:${vertical ? 920 : 1500}px">
      <div style="display:flex;align-items:center;gap:12px;justify-content:${align}">
        ${LOGO(28)}
        ${kicker('Grok Bot Inbox', t, 0.08, 1)}
      </div>
      <div style="margin-top:26px">
        ${reveal('Your Grok Bot has an inbox.', t, 0.16, b, size)}
        ${reveal('Now you can actually see it.', t, 0.48, b, size, 600, 'margin-top:8px')}
      </div>
    </div>
  </section>`;
}

function importCard(t, mode) {
  const [a, b] = SCENES.import;
  const opacity = fadeWindow(t, a, b, 0.2, 0.2);
  if (!opacity) return '';
  const vertical = mode === 'vertical';
  const W = vertical ? 1080 : 1920;
  const H = vertical ? 1920 : 1080;
  const cardW = vertical ? 680 : 600;
  const left = (W - cardW) / 2;
  const top = (H - 392) / 2;
  const target = { x: left + cardW / 2, y: top + 198 };
  const travel = cursorTravel(t, { x: target.x + 230, y: target.y + 160 }, target, a + 0.22, a + 0.95);
  const pressed = t >= a + 1.02;
  const press = clickPress(t, a + 0.98);
  const cursorOpacity = Math.min(travel.opacity, t < a + 1.15 ? 1 : easeOut((a + 1.55 - t) / 0.4));
  const step2 = t > a + 1.35;
  const rise = (1 - easeOut((t - a) / 0.24)) * 16;
  return `<section class="layer" style="opacity:${opacity}">
    <div style="position:absolute;left:${left}px;top:${top + rise}px;width:${cardW}px;background:#111113;border:1px solid rgba(255,255,255,0.1);border-radius:18px;padding:28px 28px 24px;box-shadow:0 30px 80px rgba(0,0,0,0.45)">
      ${kicker('One click', t, a + 0.05, 1)}
      <h2 style="margin:12px 0 0;font-size:${vertical ? 40 : 36}px;font-weight:600;letter-spacing:-0.035em">Import the template</h2>
      <div style="display:flex;gap:14px;align-items:center;margin-top:22px">
        ${LOGO(36)}
        <div>
          <div style="font-weight:600;font-size:16px;letter-spacing:-0.02em">Grok Bot Inbox</div>
          <div style="color:#9a9aa3;font-size:14px;margin-top:2px">A private viewer for the mail your bot receives.</div>
        </div>
      </div>
      <div style="margin-top:22px;height:52px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:16px;letter-spacing:-0.02em;background:#fafafa;color:#0a0a0a;transform:scale(${press})">${pressed ? 'Added to your bot' : 'Import template'}</div>
      <div style="margin-top:16px;display:flex;flex-direction:column;gap:8px;color:#c9c9cf;font-size:14px">
        <div style="display:flex;gap:10px;align-items:center"><span style="width:18px;height:18px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:#fafafa;color:#0a0a0a;font-size:11px;font-weight:700">1</span>Import the public template</div>
        <div style="display:flex;gap:10px;align-items:center;color:${step2 ? '#fafafa' : '#6f6f78'}"><span style="width:18px;height:18px;border-radius:999px;border:1px solid rgba(255,255,255,0.2);display:inline-flex;align-items:center;justify-content:center;font-size:11px">2</span>Open the link your bot gives you</div>
      </div>
    </div>
    <div style="position:absolute;left:${travel.x}px;top:${travel.y}px;opacity:${Math.min(opacity, cursorOpacity)};transform:translate(-3px,-2px) scale(${press});filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))">${CURSOR}</div>
  </section>`;
}

function landscapeCaption(kickerText, line, t, start, end) {
  const opacity = fadeWindow(t, start, end, 0.16, 0.16);
  if (!opacity) return '';
  return `<div style="position:absolute;left:56px;bottom:44px;z-index:3;opacity:${opacity}">
    ${kicker(kickerText, t, start, 1)}
    <div style="margin-top:6px">${reveal(line, t, start + 0.04, end, 32)}</div>
  </div>`;
}

function viewFor(mode, kind) {
  if (mode !== 'vertical') {
    return { x: 0, y: 0, w: 1920, h: 1080, radius: 0, shadow: 'none' };
  }
  if (kind === 'palette') return { x: 40, y: 250, w: 1000, h: 860, radius: 22, shadow: '0 30px 80px rgba(0,0,0,.45)' };
  if (kind === 'compose') return { x: 40, y: 230, w: 1000, h: 1280, radius: 22, shadow: '0 30px 80px rgba(0,0,0,.45)' };
  return { x: 40, y: 220, w: 1000, h: 1580, radius: 22, shadow: '0 30px 80px rgba(0,0,0,.45)' };
}

function viewer(t, mode, manifest) {
  const opacity = fadeWindow(t, SCENES.list[0], SCENES.palette[1], 0.22, 0.22);
  if (!opacity) return '';
  const vertical = mode === 'vertical';
  const cam = sample(t, VIEWER_CAM, vertical);
  const row = manifest.layout.rows[1];
  const toThread = mix(t, 7.52, 7.8);
  const toPalette = mix(t, 11.05, 11.32);
  let paletteIndex = 0;
  if (t >= 11.58) paletteIndex = Math.min(5, 1 + Math.floor((t - 11.58) / 0.072));
  const toLunch = mix(t, 12.55, 12.82);
  const sources = [];
  const listOpacity = (1 - toThread) * (1 - toPalette);
  const threadOpacity = toThread * (1 - toPalette) * (1 - toLunch);
  const paletteOpacity = toPalette * (1 - toLunch);
  const lunchOpacity = toPalette * toLunch;
  if (listOpacity > 0.004) sources.push({ src: manifest.plates.list, opacity: listOpacity });
  if (threadOpacity > 0.004) sources.push({ src: manifest.plates.thread, opacity: threadOpacity });
  if (paletteOpacity > 0.004) sources.push({ src: manifest.plates.palette[paletteIndex], opacity: paletteOpacity });
  if (lunchOpacity > 0.004) sources.push({ src: manifest.plates.lunch, opacity: lunchOpacity });

  const clickAt = 7.42;
  let cursor = null;
  if (t < 8.7) {
    const travel = cursorTravel(t, { x: 680, y: 560 }, { x: row.cx, y: row.cy }, 6.35, 7.28);
    cursor = {
      ...travel,
      opacity: travel.opacity * (t < 8.15 ? 1 : easeOut((8.7 - t) / 0.55)),
      press: clickPress(t, clickAt),
      ripple: ripple(t, clickAt),
    };
  }

  let kind = 'list';
  if (toLunch > 0.5) kind = 'thread';
  else if (toPalette > 0.35) kind = 'palette';
  else if (toThread > 0.5) kind = 'thread';
  const view = viewFor(mode, kind);

  let caption = '';
  const beat = t < 7.85 ? 0 : t < 11.15 ? 1 : t < 12.7 ? 2 : 3;
  const lines = ['Every thread. Dark, quiet, yours.', 'Open a conversation.', 'Search, or the command palette.', 'There it is.'];
  const capIn = [6.05, 7.9, 11.2, 12.72][beat];
  const capOut = [7.82, 11.1, 12.68, 13.9][beat];
  if (vertical) {
    caption = `<div style="position:absolute;left:48px;right:48px;top:64px">
      ${kicker('The viewer', t, capIn, opacity)}
      <div style="margin-top:8px">${reveal(lines[beat], t, capIn + 0.02, capOut, 40)}</div>
    </div>`;
  } else {
    caption = `${scrim(opacity)}${landscapeCaption('The viewer', lines[beat], t, capIn, capOut)}`;
  }

  return `<section class="layer" style="opacity:${opacity}">
    ${plateStack(sources, cam, view, cursor)}
    ${caption}
  </section>`;
}

function privacyCard(t, mode) {
  const [a, b] = SCENES.privacyCard;
  const opacity = fadeWindow(t, a, b, 0.2, 0.18);
  if (!opacity) return '';
  const vertical = mode === 'vertical';
  const size = vertical ? 68 : 80;
  const pad = vertical ? '0 72px' : '0 120px';
  return `<section class="layer" style="display:flex;align-items:center;padding:${pad};opacity:${opacity}">
    <div style="max-width:1480px">
      ${kicker('Private by default', t, a + 0.04, 1)}
      <div style="margin-top:16px">${reveal('Encrypted.', t, a + 0.1, b, size)}</div>
      <div style="margin-top:10px">${reveal('The key never leaves your link.', t, a + 0.32, b, vertical ? 32 : 36, 500)}</div>
      <div class="mono" style="margin-top:28px;display:inline-flex;padding:12px 16px;border-radius:12px;background:#111113;border:1px solid rgba(255,255,255,0.1);font-size:${vertical ? 18 : 20}px;color:#c9c9cf;opacity:${easeOut((t - (a + 0.5)) / 0.2)}">
        https://your-copy.vercel.app/#k=<span style="filter:blur(6px)">••••••••••••</span>
      </div>
    </div>
  </section>`;
}

function privacyShot(t, mode, manifest) {
  const [a, b] = SCENES.privacy;
  const opacity = fadeWindow(t, a, b, 0.22, 0.2);
  if (!opacity) return '';
  const vertical = mode === 'vertical';
  const cam = sample(t, LATER_CAM, vertical);
  const blurStart = 17.48;
  const frames = manifest.plates.blur;
  let index = 0;
  if (t >= blurStart) index = Math.min(frames.length - 1, Math.floor((t - blurStart) * 60));
  const eye = manifest.layout.eye;
  const clickAt = 17.72;
  const travel = cursorTravel(t, { x: 640, y: 480 }, { x: eye.cx, y: eye.cy }, 16.85, 17.62);
  const cursor = {
    ...travel,
    opacity: travel.opacity * (t < 19.3 ? 1 : easeOut((19.7 - t) / 0.4)),
    press: clickPress(t, clickAt),
    ripple: ripple(t, clickAt),
  };
  const line = t < 17.86 ? 'Press the eye, or B.' : 'Names and addresses, blurred.';
  const capIn = t < 17.86 ? 16.6 : 17.86;
  const capOut = t < 17.86 ? 17.86 : 20.05;
  const view = viewFor(mode, 'list');
  const caption = vertical
    ? `<div style="position:absolute;left:48px;right:48px;top:64px">
        ${kicker('Privacy blur', t, capIn, 1)}
        <div style="margin-top:8px">${reveal(line, t, capIn + 0.02, capOut, 40)}</div>
      </div>`
    : `${scrim(opacity)}${landscapeCaption('Privacy blur', line, t, capIn, capOut)}`;
  return `<section class="layer" style="opacity:${opacity}">
    ${plateStack([{ src: frames[index], opacity: 1 }], cam, view, cursor)}
    ${caption}
  </section>`;
}

function composeShot(t, mode, manifest) {
  const [a, b] = SCENES.compose;
  const opacity = fadeWindow(t, a, b, 0.22, 0.18);
  if (!opacity) return '';
  const vertical = mode === 'vertical';
  const cam = sample(t, LATER_CAM, vertical);
  const frames = manifest.plates.compose;
  const typeAt = 20.58;
  const index = t < typeAt ? 0 : Math.min(frames.length - 1, Math.floor((t - typeAt) / 0.038));
  const arrive = mix(t, 20.28, 20.52);
  const sources = [
    { src: manifest.plates.blur[manifest.plates.blur.length - 1], opacity: 1 - arrive },
    { src: frames[index], opacity: arrive },
  ];
  const view = viewFor(mode, 'compose');
  const caption = vertical
    ? `<div style="position:absolute;left:48px;right:48px;top:64px">
        ${kicker('Replies stay yours', t, 20.35, 1)}
        <div style="margin-top:8px">${reveal('Write it in the viewer.', t, 20.38, 23.05, 40)}</div>
      </div>`
    : `${scrim(opacity * 0.45)}${landscapeCaption('Replies stay yours', 'Write it in the viewer.', t, 20.35, 23.05)}`;
  return `<section class="layer" style="opacity:${opacity}">
    ${plateStack(sources, cam, view, null)}
    ${caption}
  </section>`;
}

function draftCard(t, mode) {
  const [a, b] = SCENES.draft;
  const opacity = fadeWindow(t, a, b, 0.2, 0.18);
  if (!opacity) return '';
  const vertical = mode === 'vertical';
  const W = vertical ? 1080 : 1920;
  const H = vertical ? 1920 : 1080;
  const cardW = vertical ? 720 : 640;
  const left = (W - cardW) / 2;
  const top = (H - 360) / 2;
  const rise = (1 - easeOut((t - a) / 0.22)) * 18;
  const approve = { x: left + cardW - 28, y: top + 296 };
  const travel = cursorTravel(t, { x: approve.x + 200, y: approve.y + 120 }, approve, a + 0.28, a + 0.95);
  return `<section class="layer" style="opacity:${opacity}">
    <div style="position:absolute;left:${left}px;top:${top + rise}px;width:${cardW}px;background:#111113;border:1px solid rgba(255,255,255,0.1);border-radius:18px;padding:26px 28px 22px;box-shadow:0 30px 80px rgba(0,0,0,0.45)">
      ${kicker('Replies stay yours', t, a + 0.04, 1)}
      <h2 style="margin:12px 0 0;font-size:${vertical ? 36 : 34}px;font-weight:600;letter-spacing:-0.035em">Waiting for your approval</h2>
      <div style="margin-top:20px;display:grid;grid-template-columns:88px 1fr;gap:10px 12px;font-size:15px;align-items:center">
        <div style="color:#9a9aa3">To</div>
        <div class="mono" style="font-size:14px;filter:blur(5px)">alice@example.com</div>
        <div style="color:#9a9aa3">Subject</div>
        <div>Re: Meeting point at the orange tent</div>
      </div>
      <p style="margin:18px 0 0;font-size:18px;line-height:1.45">See you at the orange tent.</p>
      <p style="margin:14px 0 0;color:#9a9aa3;font-size:14px">Nothing is sent until you approve this card.</p>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <span style="padding:10px 16px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);color:#c9c9cf">Not yet</span>
        <span style="padding:10px 16px;border-radius:10px;background:#fafafa;color:#0a0a0a;font-weight:600">Approve</span>
      </div>
    </div>
    <div style="position:absolute;left:${travel.x}px;top:${travel.y}px;opacity:${Math.min(opacity, easeOut((t - (a + 0.3)) / 0.16))};transform:translate(-3px,-2px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))">${CURSOR}</div>
  </section>`;
}

function endCard(t, mode) {
  const [a, b] = SCENES.end;
  const opacity = fadeWindow(t, a, b, 0.22, 0);
  if (!opacity) return '';
  const vertical = mode === 'vertical';
  const pad = vertical ? '0 64px' : '0 120px';
  const linkSize = vertical ? 22 : 28;
  return `<section class="layer" style="display:flex;align-items:center;padding:${pad};opacity:${opacity}">
    <div style="max-width:100%">
      <div style="display:flex;align-items:center;gap:14px">
        ${LOGO(40)}
        ${kicker('Open source', t, a + 0.05, 1)}
      </div>
      <div style="margin-top:18px">${reveal('Grok Bot Inbox', t, a + 0.1, b + 1, vertical ? 60 : 68)}</div>
      <div style="margin-top:8px;opacity:${easeOut((t - (a + 0.28)) / 0.18)};font-size:${vertical ? 26 : 28}px;color:#c9c9cf;letter-spacing:-0.02em">free · runs on your own Vercel</div>
      <div style="margin-top:32px;display:flex;flex-direction:column;gap:14px">
        <div style="opacity:${easeOut((t - (a + 0.42)) / 0.18)};transform:translateY(${(1 - easeOut((t - (a + 0.42)) / 0.18)) * 10}px)">
          <div class="kicker" style="font-size:11px">Template</div>
          <div class="mono" style="margin-top:6px;font-size:${linkSize}px;white-space:nowrap">https://x.ai/bot/MAHEu3SrSY7PnomT5Ik1D</div>
        </div>
        <div style="opacity:${easeOut((t - (a + 0.56)) / 0.18)};transform:translateY(${(1 - easeOut((t - (a + 0.56)) / 0.18)) * 10}px)">
          <div class="kicker" style="font-size:11px">Repo</div>
          <div class="mono" style="margin-top:6px;font-size:${linkSize}px;white-space:nowrap">https://github.com/mascarock/grokbot-inbox</div>
        </div>
      </div>
    </div>
  </section>`;
}

window.renderFrame = function renderFrame({ t, mode }) {
  const manifest = window.__manifest;
  const root = document.getElementById('root');
  const w = mode === 'vertical' ? 1080 : 1920;
  const h = mode === 'vertical' ? 1920 : 1080;
  root.style.width = `${w}px`;
  root.style.height = `${h}px`;
  document.body.style.width = `${w}px`;
  document.body.style.height = `${h}px`;
  root.innerHTML = [
    hook(t, mode),
    importCard(t, mode),
    viewer(t, mode, manifest),
    privacyCard(t, mode),
    privacyShot(t, mode, manifest),
    composeShot(t, mode, manifest),
    draftCard(t, mode),
    endCard(t, mode),
  ].join('');
};

window.settleFrame = function settleFrame() {
  const imgs = [...document.images];
  return Promise.all(
    imgs.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve(true);
            return;
          }
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
        }),
    ),
  );
};
