CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE venues (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  location GEOGRAPHY(Point, 4326) NOT NULL
);
CREATE INDEX venues_location_idx ON venues USING GIST (location);

CREATE TABLE sources (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,                    -- ical | manual (rss/api/scrape later)
  url TEXT,
  auto_approve BOOLEAN NOT NULL DEFAULT false,
  last_fetched_at TIMESTAMPTZ
);

CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  venue_id INT NOT NULL REFERENCES venues(id),
  price_cents INT NOT NULL DEFAULT 0,
  source_id INT REFERENCES sources(id),
  external_id TEXT,                      -- id from the source: makes ingestion idempotent
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, external_id)        -- NULLs allowed multiple times (user submissions)
);
CREATE INDEX events_starts_at_idx ON events (starts_at);
CREATE INDEX events_status_idx ON events (status);
CREATE INDEX events_venue_idx ON events (venue_id);

CREATE TABLE tags (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);
CREATE TABLE event_tags (
  event_id INT REFERENCES events(id) ON DELETE CASCADE,
  tag_id INT REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, tag_id)
);

CREATE TABLE favorites (
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  event_id INT REFERENCES events(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, event_id)
);

-- Cache so we never geocode the same address twice (and respect Nominatim's limits)
CREATE TABLE geocode_cache (
  address_key TEXT PRIMARY KEY,
  lat DOUBLE PRECISION,                  -- NULL = looked up, nothing found
  lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per source per pipeline run: your ingestion "observability"
CREATE TABLE pipeline_runs (
  id SERIAL PRIMARY KEY,
  source_id INT REFERENCES sources(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  fetched INT NOT NULL DEFAULT 0,
  inserted INT NOT NULL DEFAULT 0,
  updated INT NOT NULL DEFAULT 0,
  skipped INT NOT NULL DEFAULT 0,
  duplicates INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  error TEXT
);

INSERT INTO tags (name) VALUES
  ('chill'), ('loud'), ('family-friendly'), ('outdoors'), ('creative'),
  ('music'), ('market'), ('social'), ('learning')
ON CONFLICT DO NOTHING;
