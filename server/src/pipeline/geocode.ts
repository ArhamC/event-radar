import { pool } from '../db/pool';
import { config } from '../config';

// Turns address text into coordinates using OpenStreetMap's Nominatim.
// Their usage policy: max 1 request/second, identify yourself with a User-Agent, cache results.
// https://operations.osmfoundation.org/policies/nominatim/

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastRequestAt = 0;
const VIEWBOX_DEG = 0.3;

const keyFor = (address: string) => address.toLowerCase().replace(/\s+/g, ' ').trim();

export async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const key = keyFor(address);

  const cached = await pool.query('SELECT lat, lng FROM geocode_cache WHERE address_key = $1', [key]);
  if (cached.rows[0]) {
    const { lat, lng } = cached.rows[0];
    return lat == null ? null : { lat, lng };
  }

  const wait = 1100 - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();

  // Only accept matches in Canada, inside a box around the city (~25-35 km each way), so a feed's
  // "Central Library" resolves to London's, not one in another country.
  const c = config.center;
  const params = new URLSearchParams({
    format: 'jsonv2',
    limit: '1',
    q: address,
    countrycodes: 'ca',
    viewbox: [c.lng - VIEWBOX_DEG, c.lat + VIEWBOX_DEG, c.lng + VIEWBOX_DEG, c.lat - VIEWBOX_DEG].join(','),
    bounded: '1',
  });
  const url = `https://nominatim.openstreetmap.org/search?${params}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': `EventRadar/1.0 (student project; ${config.geocoderContact})` },
  });
  if (!res.ok) throw new Error(`Nominatim responded ${res.status}`);
  const results = (await res.json()) as { lat: string; lon: string }[];

  const hit = results[0] ? { lat: Number(results[0].lat), lng: Number(results[0].lon) } : null;
  // Cache misses too, so a bad address doesn't get retried every run
  await pool.query(
    'INSERT INTO geocode_cache (address_key, lat, lng) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    [key, hit?.lat ?? null, hit?.lng ?? null]
  );
  return hit;
}
