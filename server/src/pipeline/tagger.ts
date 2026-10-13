// Keyword rules that suggest "vibes" from an event's text.
// Good first version; swap in an LLM classifier later and keep these as a fallback.

const RULES: Record<string, string[]> = {
  music: ['open mic', 'band', 'bands', 'concert', 'live music', 'jam', 'dj', 'acoustic', 'choir', 'vinyl'],
  market: ['market', 'vendor', 'vendors', 'craft fair', 'flea', 'farmers', 'bazaar', 'swap meet'],
  outdoors: ['park', 'trail', 'hike', 'garden', 'outdoor', 'picnic', 'waterfront', 'run club'],
  'family-friendly': ['family', 'kids', 'children', 'all ages', 'storytime'],
  creative: ['art', 'workshop', 'paint', 'poetry', 'craft', 'zine', 'pottery', 'sketch', 'writing', 'open mic'],
  learning: ['talk', 'lecture', 'class', 'workshop', 'seminar', 'lesson', 'book club', 'intro to'],
  social: ['meetup', 'mixer', 'trivia', 'game night', 'club', 'social', 'networking'],
  loud: ['dj', 'punk', 'metal', 'rave', 'dance party', 'festival'],
  chill: ['acoustic', 'book club', 'poetry', 'coffee', 'board game', 'quiet', 'yoga'],
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const COMPILED = Object.entries(RULES).map(([tag, words]) => ({
  tag,
  re: new RegExp(`(^|\\W)(${words.map(escape).join('|')})(\\W|$)`, 'i'),
}));

export function suggestTags(title: string, description = ''): string[] {
  const text = `${title} ${description}`;
  return COMPILED.filter(({ re }) => re.test(text)).map(({ tag }) => tag);
}
