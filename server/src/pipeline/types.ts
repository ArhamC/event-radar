// What every source adapter (ical, rss, api...) must produce.
export interface RawEvent {
  externalId: string;
  title: string;
  description?: string;
  startsAt: Date;
  endsAt?: Date;
  locationText?: string; // free-text address or venue name from the source
  url?: string;
}
