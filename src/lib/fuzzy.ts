/**
 * Small subsequence matcher for the command palette. Characters of the query
 * must appear in order; matches at word starts and runs of consecutive
 * matches score higher. Returns null when the query does not match.
 */
export interface FuzzyMatch {
  score: number;
  /** Indices into the haystack that matched, for highlighting. */
  indices: number[];
}

export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, indices: [] };
  const t = text.toLowerCase();
  if (q.length > t.length) return null;

  const indices: number[] = [];
  let score = 0;
  let ti = 0;
  let lastMatch = -2;
  for (let qi = 0; qi < q.length; qi += 1) {
    const found = t.indexOf(q[qi], ti);
    if (found === -1) return null;
    indices.push(found);
    let gain = 1;
    if (found === lastMatch + 1) gain += 4;
    if (found === 0 || /[\s\-_/.:@+]/.test(t[found - 1] ?? '')) gain += 3;
    gain -= Math.min(3, (found - ti) * 0.25);
    score += gain;
    lastMatch = found;
    ti = found + 1;
  }
  if (t.startsWith(q)) score += 6;
  if (t === q) score += 10;
  score -= (t.length - q.length) * 0.02;
  return { score, indices };
}

export function fuzzyFilter<T>(query: string, items: T[], text: (item: T) => string, limit = 50): { item: T; match: FuzzyMatch }[] {
  const out: { item: T; match: FuzzyMatch }[] = [];
  for (const item of items) {
    const match = fuzzyMatch(query, text(item));
    if (match) out.push({ item, match });
  }
  if (query.trim()) out.sort((a, b) => b.match.score - a.match.score);
  return out.slice(0, limit);
}
