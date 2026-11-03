/* Frame-accurate promo stage. window.renderFrame({ t, mode, clips }) draws one frame. */

const EASE = (t) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const LOGO = `<svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
  <rect x="1" y="1" width="30" height="30" rx="8" fill="#19191c" stroke="rgba(255,255,255,0.16)"/>
  <path d="M8 12.5h16v9H8z" fill="none" stroke="#fafafa" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="m8.5 13 7.5 5.2 7.5-5.2" fill="none" stroke="#fafafa" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`;

const CURSOR = `<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
  <path d="M6.2 3.2 22.4 14.4 13.4 15.9 10.4 24.2 6.2 3.2Z" fill="#fafafa" stroke="#0a0a0a" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`;

function presence(t, start, end, fadeIn = 0.32, fadeOut = 0.26) {
  if (t < start || t >= end) return 0;
  let opacity = 1;
  if (t < start + fadeIn) opacity = EASE((t - start) / fadeIn);
  if (fadeOut > 0 && t > end - fadeOut) opacity = Math.min(opacity, 1 - EASE((t - (end - fadeOut)) / fadeOut));
  return opacity;
}

function rise(opacity) {
  return `translateY(${(1 - opacity) * 18}px)`;
}

function frameSrc(clip, ms, clips) {
  const meta = clips[clip];
  if (!meta) return '';
  const index = clamp(Math.round((ms / 1000) * 30) + 1, 1, meta.frameCount);
  return `/capture/frames/${clip}/${String(index).padStart(4, '0')}.png`;
}

function shot(clip, ms, clips, extra = '') {
  const src = frameSrc(clip, ms, clips);
  return `<img class="shot" alt="" src="${src}" style="${extra}" />`;
}

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Vertical crop of a 1920×1080 recording. `scale` zooms in so UI type stays
 * readable on a phone; `x`/`y` are the source-pixel origin of the window.
 */
function verticalShot(src, { scale, x, y, boxH }) {
  const imgW = Math.round(1920 * scale);
  const imgH = Math.round(1080 * scale);
  const shiftX = Math.round(-x * scale);
  const shiftY = Math.round(-y * scale);
  return `<div style="width:100%;height:${boxH}px;overflow:hidden;border-radius:20px;border:1px solid rgba(255,255,255,0.12);box-shadow:0 30px 80px rgba(0,0,0,0.5);background:#0a0a0a;">
    <img alt="" src="${src}" style="width:${imgW}px;height:${imgH}px;max-width:none;margin-left:${shiftX}px;margin-top:${shiftY}px;display:block;" />
  </div>`;
}

function verticalScene(opacity, kicker, line, shotHtml) {
  return `<section class="layer" style="opacity:${opacity};display:flex;flex-direction:column;padding:72px 40px 48px;gap:28px;">
    <div>
      <div class="kicker">${kicker}</div>
      <div style="margin-top:10px;font-size:42px;font-weight:600;letter-spacing:-0.035em;line-height:1.12;">${line}</div>
    </div>
    ${shotHtml}
  </section>`;
}

/** List, then the open thread, then the centered command palette. */
function viewerFocus(t) {
  if (t < 11.05) return { scale: 1.72, x: 0, y: 0, boxH: 1560 };
  if (t < 12.15) {
    const p = EASE((t - 11.05) / 1.1);
    return { scale: lerp(1.72, 1.46, p), x: lerp(0, 590, p), y: 0, boxH: Math.round(lerp(1560, 1480, p)) };
  }
  if (t < 13.2) return { scale: 1.46, x: 590, y: 0, boxH: 1480 };
  if (t < 14.05) {
    const p = EASE((t - 13.2) / 0.85);
    return { scale: lerp(1.46, 1.42, p), x: lerp(590, 560, p), y: lerp(0, 70, p), boxH: Math.round(lerp(1480, 920, p)) };
  }
  return { scale: 1.42, x: 560, y: 70, boxH: 920 };
}

function captionCard(kicker, line, opacity, style) {
  return `<div style="position:absolute;${style};opacity:${opacity};transform:${rise(opacity)};">
    <div style="background:rgba(10,10,10,0.82);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:16px 20px 18px;box-shadow:0 18px 50px rgba(0,0,0,0.35);max-width:640px;">
      <div class="kicker">${kicker}</div>
      <div style="margin-top:6px;font-size:28px;font-weight:600;letter-spacing:-0.03em;line-height:1.2;">${line}</div>
    </div>
  </div>`;
}

function hook(t, mode) {
  const opacity = presence(t, 0, 4, 0.4, 0.3);
  if (!opacity) return '';
  const line = (delay) => {
    const local = presence(t, delay, 4, 0.45, 0.3);
    return `opacity:${local};transform:${rise(local)}`;
  };
  const pad = mode === 'vertical' ? '0 72px' : '0 140px';
  const size = mode === 'vertical' ? 54 : 68;
  return `<section class="layer" style="display:flex;align-items:center;padding:${pad};opacity:${opacity}">
    <div style="max-width:${mode === 'vertical' ? '100%' : '1500px'}">
      <div style="display:flex;align-items:center;gap:12px;${line(0.05)}">
        ${LOGO}
        <span class="kicker">Grok Bot Inbox</span>
      </div>
      <h1 style="margin:28px 0 0;font-weight:600;font-size:${size}px;letter-spacing:-0.038em;line-height:1.08;">
        <span style="display:block;${line(0.18)}">Your Grok Bot has an inbox.</span>
        <span style="display:block;margin-top:10px;${line(0.42)}">Now you can actually see it.</span>
      </h1>
    </div>
  </section>`;
}

function importCard(t, mode) {
  const opacity = presence(t, 4, 9, 0.35, 0.28);
  if (!opacity) return '';
  const local = t - 4;
  const clicked = local > 1.7;
  const step2 = local > 2.25;
  const press = local > 1.55 && local < 1.72;
  const cursorT = EASE(clamp((local - 0.55) / 0.85, 0, 1));
  const vertical = mode === 'vertical';
  const cardW = vertical ? 640 : 600;
  // Cursor travels toward the button, which sits in the lower middle of a centered card.
  const cx = (vertical ? 1080 : 1920) / 2;
  const cy = (vertical ? 1920 : 1080) / 2 + (vertical ? 40 : 70);
  const x0 = cx + 220;
  const y0 = cy + 180;
  const x = x0 + (cx - x0) * cursorT;
  const y = y0 + (cy - y0) * cursorT;
  const showCursor = local > 0.45 && local < 3.4;
  return `<section class="layer" style="display:flex;align-items:center;justify-content:center;opacity:${opacity};padding:48px;">
    <div style="width:${cardW}px;max-width:100%;background:#111113;border:1px solid rgba(255,255,255,0.1);border-radius:18px;padding:32px 32px 28px;box-shadow:0 30px 80px rgba(0,0,0,0.45);transform:${rise(opacity)}">
      <div class="kicker">One click</div>
      <h2 style="margin:12px 0 0;font-size:${vertical ? 36 : 40}px;font-weight:600;letter-spacing:-0.035em;">Import the template</h2>
      <div style="display:flex;gap:14px;align-items:center;margin-top:26px;">
        ${LOGO.replace('width="28"', 'width="36"').replace('height="28"', 'height="36"')}
        <div>
          <div style="font-weight:600;font-size:16px;letter-spacing:-0.02em;">Grok Bot Inbox</div>
          <div style="color:#9a9aa3;font-size:14px;margin-top:2px;">A private viewer for the mail your bot receives.</div>
        </div>
      </div>
      <div style="margin-top:26px;height:52px;border-radius:12px;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:600;font-size:16px;letter-spacing:-0.02em;background:${clicked ? '#fafafa' : '#fafafa'};color:#0a0a0a;transform:scale(${press ? 0.975 : 1});">
        ${clicked ? 'Added to your bot' : 'Import template'}
      </div>
      <div style="margin-top:18px;display:flex;flex-direction:column;gap:8px;color:#c9c9cf;font-size:14px;">
        <div style="display:flex;gap:10px;align-items:center;">
          <span style="width:18px;height:18px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:#fafafa;color:#0a0a0a;font-size:11px;font-weight:700;">1</span>
          Import the public template
        </div>
        <div style="display:flex;gap:10px;align-items:center;color:${step2 ? '#fafafa' : '#6f6f78'};">
          <span style="width:18px;height:18px;border-radius:999px;border:1px solid rgba(255,255,255,0.2);display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;">2</span>
          Open the link your bot gives you
        </div>
      </div>
    </div>
    ${showCursor ? `<div style="position:absolute;left:${x}px;top:${y}px;transform:translate(-3px,-2px) scale(${press ? 0.86 : 1});filter:drop-shadow(0 2px 3px rgba(0,0,0,.5));">${CURSOR}</div>` : ''}
  </section>`;
}

function viewerCaption(t) {
  if (t < 11.15) return ['The viewer', 'Every thread. Dark, quiet, yours.'];
  if (t < 13.15) return ['The viewer', 'Open a conversation.'];
  return ['The viewer', 'Search, or the command palette.'];
}

function viewer(t, mode, clips) {
  const opacity = presence(t, 9, 17, 0.25, 0.24);
  if (!opacity) return '';
  const ms = clips.viewer.readyMs + (t - 9) * 1000;
  const [kicker, line] = viewerCaption(t);
  const cap = presence(t, 9.15, 16.75, 0.25, 0.2);
  if (mode === 'vertical') {
    const focus = viewerFocus(t);
    return verticalScene(opacity, kicker, line, verticalShot(frameSrc('viewer', ms, clips), focus));
  }
  return `<section class="layer" style="opacity:${opacity}">
    ${shot('viewer', ms, clips)}
    <div style="position:absolute;left:0;right:0;bottom:0;height:220px;background:linear-gradient(to top, rgba(0,0,0,0.55), transparent);"></div>
    ${captionCard(kicker, line, cap, 'left:640px;bottom:36px;')}
  </section>`;
}

function privacy(t, mode, clips) {
  const opacity = presence(t, 17, 23, 0.28, 0.24);
  if (!opacity) return '';
  const footageStart = 19.35;
  if (t < footageStart) {
    const local = presence(t, 17, footageStart + 0.05, 0.3, 0.2);
    const pad = mode === 'vertical' ? '0 72px' : '0 140px';
    const size = mode === 'vertical' ? 60 : 76;
    return `<section class="layer" style="display:flex;align-items:center;padding:${pad};opacity:${opacity * local}">
      <div style="max-width:1400px;transform:${rise(local)}">
        <div class="kicker">Private by default</div>
        <h2 style="margin:18px 0 0;font-size:${size}px;font-weight:600;letter-spacing:-0.04em;line-height:1.02;">Encrypted.</h2>
        <p style="margin:14px 0 0;font-size:${mode === 'vertical' ? 32 : 36}px;font-weight:500;letter-spacing:-0.03em;color:#fafafa;">The key never leaves your link.</p>
        <div class="mono" style="margin-top:32px;display:inline-flex;align-items:center;gap:0;padding:12px 16px;border-radius:12px;background:#111113;border:1px solid rgba(255,255,255,0.1);font-size:${mode === 'vertical' ? 18 : 20}px;color:#c9c9cf;">
          https://your-copy.vercel.app/#k=<span class="mask">••••••••••••</span>
        </div>
      </div>
    </section>`;
  }
  const ms = clips.privacy.readyMs + (t - footageStart) * 1000;
  const cap = presence(t, footageStart + 0.15, 22.75, 0.25, 0.2);
  const line = t < footageStart + (clips.privacy.marks.blurred - clips.privacy.readyMs) / 1000 + 0.15
    ? 'Press the eye, or B.'
    : 'Names and addresses, blurred. Perfect for demos.';
  if (mode === 'vertical') {
    return verticalScene(
      opacity,
      'Privacy blur',
      line,
      verticalShot(frameSrc('privacy', ms, clips), { scale: 1.72, x: 0, y: 0, boxH: 1560 }),
    );
  }
  return `<section class="layer" style="opacity:${opacity}">
    ${shot('privacy', ms, clips)}
    <div style="position:absolute;left:0;right:0;bottom:0;height:220px;background:linear-gradient(to top, rgba(0,0,0,0.5), transparent);"></div>
    ${captionCard('Privacy blur', line, cap, 'left:640px;bottom:40px;')}
  </section>`;
}

function reply(t, mode, clips) {
  const opacity = presence(t, 23, 27, 0.24, 0.22);
  if (!opacity) return '';
  const cardAt = 25.45;
  if (t < cardAt) {
    const ms = clips.reply.readyMs + (t - 23) * 1000;
    const cap = presence(t, 23.1, cardAt, 0.2, 0.15);
    if (mode === 'vertical') {
      return verticalScene(
        opacity,
        'Replies stay yours',
        'Write it in the viewer.',
        verticalShot(frameSrc('reply', ms, clips), { scale: 1.72, x: 1272, y: 196, boxH: 1580 }),
      );
    }
    return `<section class="layer" style="opacity:${opacity}">
      ${shot('reply', ms, clips)}
      ${captionCard('Replies stay yours', 'Write it in the viewer.', cap, 'left:48px;bottom:118px;')}
    </section>`;
  }
  const local = presence(t, cardAt, 27, 0.28, 0.22);
  const vertical = mode === 'vertical';
  return `<section class="layer" style="display:flex;align-items:center;justify-content:center;opacity:${opacity * local};padding:48px;">
    <div style="width:${vertical ? 680 : 640}px;max-width:100%;background:#111113;border:1px solid rgba(255,255,255,0.1);border-radius:18px;padding:28px 28px 24px;box-shadow:0 30px 80px rgba(0,0,0,0.45);transform:${rise(local)}">
      <div class="kicker">Replies stay yours</div>
      <h2 style="margin:12px 0 0;font-size:${vertical ? 36 : 34}px;font-weight:600;letter-spacing:-0.035em;">Waiting for your approval</h2>
      <div style="margin-top:22px;display:grid;grid-template-columns:88px 1fr;gap:10px 12px;font-size:15px;align-items:center;">
        <div style="color:#9a9aa3;">To</div>
        <div class="mono mask" style="font-size:14px;">•••••@•••••••.•••</div>
        <div style="color:#9a9aa3;">Subject</div>
        <div>Re: Meeting point at the orange tent</div>
      </div>
      <p style="margin:20px 0 0;font-size:18px;line-height:1.45;">See you at the orange tent.</p>
      <p style="margin:16px 0 0;color:#9a9aa3;font-size:14px;">Nothing is sent until you approve this card.</p>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:22px;">
        <span style="padding:10px 16px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);color:#c9c9cf;font-weight:500;">Not yet</span>
        <span style="padding:10px 16px;border-radius:10px;background:#fafafa;color:#0a0a0a;font-weight:600;">Approve</span>
      </div>
    </div>
  </section>`;
}

function endCard(t, mode) {
  const opacity = presence(t, 27, 30.01, 0.35, 0);
  if (!opacity) return '';
  const vertical = mode === 'vertical';
  const linkSize = vertical ? 22 : 26;
  const linkIn = presence(t, 27.35, 30.01, 0.35, 0);
  return `<section class="layer" style="display:flex;align-items:center;padding:${vertical ? '0 64px' : '0 140px'};opacity:${opacity}">
    <div style="max-width:100%;transform:${rise(opacity)}">
      <div style="display:flex;align-items:center;gap:14px;">
        ${LOGO.replace('width="28"', 'width="40"').replace('height="28"', 'height="40"')}
        <div class="kicker">Open source</div>
      </div>
      <h2 style="margin:22px 0 0;font-size:${vertical ? 56 : 64}px;font-weight:600;letter-spacing:-0.04em;line-height:1.05;">Grok Bot Inbox</h2>
      <p style="margin:14px 0 0;font-size:${vertical ? 26 : 28}px;color:#c9c9cf;letter-spacing:-0.02em;">free · runs on your own Vercel</p>
      <div style="margin-top:36px;display:flex;flex-direction:column;gap:14px;opacity:${linkIn};transform:${rise(linkIn)}">
        <div>
          <div class="kicker" style="font-size:11px;">Template</div>
          <div class="mono" style="margin-top:6px;font-size:${linkSize}px;letter-spacing:-0.01em;white-space:nowrap;">https://x.ai/bot/MAHEu3SrSY7PnomT5Ik1D</div>
        </div>
        <div>
          <div class="kicker" style="font-size:11px;">Repo</div>
          <div class="mono" style="margin-top:6px;font-size:${linkSize}px;letter-spacing:-0.01em;white-space:nowrap;">https://github.com/mascarock/grokbot-inbox</div>
        </div>
      </div>
    </div>
  </section>`;
}

window.renderFrame = function renderFrame({ t, mode, clips }) {
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
    viewer(t, mode, clips),
    privacy(t, mode, clips),
    reply(t, mode, clips),
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
