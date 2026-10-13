# Side Street (Local Event Radar)

Find small local events in **London, Ontario** (open mics, markets, club meetings) on a map. Filter by distance, date, and vibe.
Events come from three places: user submissions (with moderation), iCal feeds pulled in by an automated
pipeline, and hand-seeded data.

**Stack:** React + TypeScript + Vite + MapLibre GL, Node + Express + TypeScript, PostgreSQL + PostGIS, Docker Compose.

## Run it locally

You need Node 22+ and Docker Desktop. (On Windows, Docker Desktop needs WSL 2: run `wsl --install` in an admin terminal first.)

```bash
# 1. Database (PostgreSQL with PostGIS)
docker compose up -d

# 2. API
cd server
cp .env.example .env        # then edit it: set ADMIN_EMAIL and GEOCODER_CONTACT to your email
npm install
npm run migrate             # creates the tables
npm run seed                # sample events around downtown London
npm run dev                 # http://localhost:4000  (check /api/health/db)

# 3. Client (new terminal)
cd client
cp .env.example .env.local  # defaults to downtown London, nothing to change
npm install
npm run dev                 # http://localhost:5173
```

Register in the app with the email you put in `ADMIN_EMAIL` and you become an admin (you get a "Review queue" button,
and your submitted events publish immediately).

Tests: `cd server && npm test`

## Importing real events (the pipeline)

Find an iCal (`.ics`) feed from a London library branch, community centre, venue, or Western/Fanshawe calendar, then:

```bash
cd server
npm run add-source -- "Public library events" https://example.org/events.ics
npm run pipeline
```

Imported events land in the review queue as `pending` (add `--auto-approve` to a trusted source to skip that).
Each run is logged in the `pipeline_runs` table (fetched / inserted / updated / skipped / duplicates / failed).
To run it on a schedule, set `ENABLE_PIPELINE_CRON=true` in `server/.env`.

What the pipeline does for each event: expands recurring events -> geocodes the address (OpenStreetMap Nominatim,
limited to Canada and a box around London, cached, 1 request/sec, per their usage policy) -> finds or creates the venue -> checks for duplicates (same venue,
within 2h, similar title) -> upserts using `(source_id, external_id)` so re-runs never duplicate -> suggests vibe tags.

## Project layout

```
server/
  migrations/001_init.sql      schema (PostGIS, indexes, constraints)
  src/routes/                  auth, events (radius search), tags, admin
  src/pipeline/                ical source, geocode, dedupe, tagger, run
  tests/                       dedupe + tagger unit tests, iCal adapter test (local feed), API smoke tests
client/
  src/components/              MapView, FilterBar, EventCard, SubmitForm, AdminQueue...
```

## Design decisions (put your own answers here, interviewers ask)

- **PostGIS `geography` + GiST index** for radius search (`ST_DWithin`) instead of computing distance in application code.
- **Idempotent ingestion** via `UNIQUE (source_id, external_id)` + `INSERT ... ON CONFLICT DO UPDATE`.
- **Fuzzy dedupe** using token-set Jaccard similarity on normalized titles, limited to the same venue and a +/-2h window.
- **One city, one time zone**: the server pins `TZ` to `CITY_TIMEZONE` (America/Toronto) and the client formats times in that
  zone, so "7pm" means 7pm in London whether the host runs in UTC or the visitor is in Vancouver.
- **Moderation queue**: user submissions and imported events start `pending`; a re-import never overrides an admin's decision.
- **Auth**: bcrypt password hashes, JWT in an httpOnly cookie, rate-limited login, zod validation on every input.
- TODO: write down what you'd change with 10x the data or users.

## Deploying

- **Database + API:** Render or Railway (Postgres with PostGIS; run `npm run migrate` on deploy). Set `NODE_ENV=production`,
  `JWT_SECRET`, `DATABASE_URL`, `CLIENT_ORIGIN` (`CITY_TIMEZONE` defaults to America/Toronto).
- **Client:** Vercel or Netlify. Set `VITE_API_URL` to the API's URL.
- Cookies: when the client and API are on different domains the cookie is sent as `SameSite=None; Secure` (already handled
  when `NODE_ENV=production`). Putting both under one domain (e.g. `app.example.com` and `api.example.com`) is cleaner.

## Ideas to extend it

- More source types: RSS, Eventbrite API, a polite scraper for one small site (check robots.txt and terms first)
- LLM vibe classification, with the keyword rules as fallback
- Report button + moderation of reports, "tonight near me" mode, weekly email digest
- Integration tests for `/api/events` against a real PostGIS container in CI
