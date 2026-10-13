// What every source adapter (ical, western, tourism-london...) must produce.
export interface RawEvent {
  externalId: string;
  title: string;
  description?: string;
  startsAt: Date;
  endsAt?: Date;
  locationText?: string; // free-text address or venue name from the source
  url?: string;
  venueName?: string; // when the adapter knows it better than "first part of locationText"
  point?: { lat: number; lng: number }; // known coordinates: skips geocoding
  fallbackPoint?: { lat: number; lng: number }; // used if geocoding finds nothing
  priceCents?: number | null; // undefined/null = unknown
}

// Passed to every adapter. Adapters that are expensive to run (one request per event) use it to
// skip events they already have; cheap ones ignore it.
export interface AdapterContext {
  known: Map<string, Date>; // external_id -> stored starts_at, for this source
  config: SourceConfig;
}

// sources.config
export interface SourceConfig {
  venueName?: string; // default venue for events without their own location
  address?: string;
}
