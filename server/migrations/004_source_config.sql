-- Adapter settings per source. For single-venue sources (a bar's own events page) this holds the
-- venue, e.g. {"venueName": "Honey Dip", "address": "623 Dundas Street, London, ON"}, used for
-- events that don't carry their own location.
ALTER TABLE sources ADD COLUMN config JSONB NOT NULL DEFAULT '{}';
