// Pure functions so they're easy to unit test (see tests/dedupe.test.ts).

const STOP_WORDS = new Set(['the', 'a', 'an', 'at', 'and', 'of', 'in', 'on', 'with', 'for']);

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function titleTokens(title: string): string[] {
  return normalizeTitle(title)
    .split(' ')
    .filter((t) => t && !STOP_WORDS.has(t));
}

// Jaccard similarity of token sets: |A ∩ B| / |A ∪ B|, from 0 to 1.
export function titleSimilarity(a: string, b: string): number {
  const A = new Set(titleTokens(a));
  const B = new Set(titleTokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export function withinHours(a: Date, b: Date, hours: number): boolean {
  return Math.abs(a.getTime() - b.getTime()) <= hours * 3_600_000;
}

// Two listings are "the same event" if they're close in time AND the titles are alike.
// (The caller has already narrowed candidates to the same venue / nearby.)
export function isLikelyDuplicate(
  a: { title: string; startsAt: Date },
  b: { title: string; startsAt: Date },
  { threshold = 0.6, hours = 2 } = {}
): boolean {
  return withinHours(a.startsAt, b.startsAt, hours) && titleSimilarity(a.title, b.title) >= threshold;
}
