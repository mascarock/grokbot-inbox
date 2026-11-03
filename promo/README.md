# Promo

30-second spot for Grok Bot Inbox. Landscape is 1920×1080, the vertical cut is 1080×1920, both H.264 at 30 fps. The inbox footage is the real app on the fictional `/?demo` sample. Title cards are drawn in `stage/`.

## Re-render

From the repo root, in one terminal:

```sh
npm install
npm run dev
```

Then:

```sh
cd promo
npm install
npx playwright install chromium
PROMO_APP_URL=http://127.0.0.1:5173/?demo npm run record
npm run render
```

`npm run render` writes:

- `out/grokbot-inbox-promo.mp4`
- `out/grokbot-inbox-promo-vertical.mp4`
- `out/poster.png`

`node render.mjs --only=landscape` skips the vertical cut. Recordings land in `capture/` (gitignored). Do not commit the mp4s.
