export type GoodFor = 'solo' | 'group' | 'both';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface EventItem {
  id: number;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  price_cents: number | null; // null = unknown (imported events)
  source_url: string | null;
  venue_name: string;
  address: string | null;
  lat: number;
  lng: number;
  distance_m: number;
  good_for: GoodFor;
  tags: string[];
  is_favorite?: boolean;
}

export interface AdminEvent extends Omit<EventItem, 'distance_m' | 'is_favorite'> {
  status: string;
  source: string;
}

export interface User {
  id: number;
  email: string;
  role: 'user' | 'admin';
}
