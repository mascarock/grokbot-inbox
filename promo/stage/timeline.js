/** Shared scene clock. Times are seconds. Overlaps are crossfades. */
export const FPS = 60;
export const DURATION = 30;

export const SCENES = {
  hook: [0, 3.28],
  import: [3.02, 6.12],
  list: [5.86, 8.85],
  thread: [8.55, 11.35],
  palette: [11.05, 14.02],
  privacyCard: [13.76, 16.68],
  privacy: [16.42, 20.18],
  compose: [19.92, 23.22],
  draft: [22.96, 26.12],
  end: [25.86, 30],
};

/** Soft ticks and whooshes, in seconds. Kept sparse so they land on cuts and clicks. */
export const CUES = [
  { t: 0.06, kind: 'whoosh' },
  { t: 3.08, kind: 'whoosh' },
  { t: 4.28, kind: 'tick' },
  { t: 5.95, kind: 'whoosh' },
  { t: 7.42, kind: 'tick' },
  { t: 8.62, kind: 'whoosh' },
  { t: 11.12, kind: 'whoosh' },
  { t: 13.82, kind: 'whoosh' },
  { t: 16.5, kind: 'whoosh' },
  { t: 17.72, kind: 'tick' },
  { t: 20.22, kind: 'whoosh' },
  { t: 23.02, kind: 'whoosh' },
  { t: 25.92, kind: 'whoosh' },
];
