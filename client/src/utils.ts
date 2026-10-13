import type { LatLng } from './types';

// Events are shown in London, Ontario time even if the visitor's browser is in another zone.
const timeZone = 'America/Toronto';

export function dayParts(iso: string) {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString(undefined, { day: 'numeric', timeZone }),
    month: d.toLocaleDateString(undefined, { month: 'short', timeZone }),
    weekday: d.toLocaleDateString(undefined, { weekday: 'short', timeZone }),
  };
}

export function timeRange(startIso: string, endIso: string | null) {
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', timeZone };
  const s = new Date(startIso).toLocaleTimeString(undefined, opts);
  return endIso ? `${s} to ${new Date(endIso).toLocaleTimeString(undefined, opts)}` : s;
}

export function fullDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone });
}

export function distanceLabel(m: number) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m away` : `${(m / 1000).toFixed(1)} km away`;
}

export function priceLabel(cents: number) {
  return cents === 0 ? 'Free' : `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

// Rough meters between two points (fine at city scale)
export function metersBetween(a: LatLng, b: LatLng) {
  const dy = (a.lat - b.lat) * 111_320;
  const dx = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

export function rangeToDates(range: 'today' | 'week' | 'month') {
  const from = new Date();
  const to = new Date();
  if (range === 'today') to.setHours(23, 59, 59, 999);
  else if (range === 'week') to.setDate(to.getDate() + 7);
  else to.setDate(to.getDate() + 30);
  return { from, to };
}
