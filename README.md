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

Besides plain iCal there are two London-specific source types:

```bash
# Western University's public calendar (JSON feed; only "General Public", in-person events)
npm run add-source -- "Western University events" https://www.uwo.ca/events/_data/current-live.json --type=western --auto-approve
# Tourism London: reads the listing pages, then each event's "Add to Calendar" .ics.
# Honours their robots.txt Crawl-delay of 10s. The first run fetches everything (~25 minutes); after that it
# only fetches new events and ones in the next 7 days whose listed date changed (usually 1-3 minutes).
npm run add-source -- "Tourism London" https://www.londontourism.ca/events --type=tourism-london --auto-approve
```

Eventbrite organizers (free private token from eventbrite.com/platform in `EVENTBRITE_TOKEN`; one source per organizer;
online events and events more than 40 km away are skipped):

```bash
npm run add-source -- "London Public Library (Eventbrite)" https://www.eventbrite.ca/o/london-public-library-67405991003 --type=eventbrite --auto-approve
```

London Public Library (reads the lpl.ca listing pages in date order, 2s apart, until 60 days out; ~2 minutes):

```bash
npm run add-source -- "London Public Library" https://www.lpl.ca/whats-on --type=lpl --auto-approve
```

Bars and venues (`--venue`/`--address` set the place for events that don't carry one):

```bash
# Any Squarespace events page (uses its ?format=json twin)
npm run add-source -- "Honey Dip" https://www.honeydipbar.com/events --type=squarespace --venue="Honey Dip" --address="623 Dundas Street, London, ON" --auto-approve
# Any Wix Events page (reads the event JSON embedded in the page)
npm run add-source -- "Richmond Tavern" https://www.richmondtavern.ca/upcoming-events --type=wix-events --venue="Richmond Tavern" --address="372 Richmond Street, London, ON" --auto-approve
# London Music Hall's listing (also covers Rum Runners)
npm run add-source -- "London Music Hall & Rum Runners" https://londonmusichall.com/upcoming-events/ --type=london-music-hall --auto-approve
# Venues that sell through Eventbrite, e.g. Toboggan Brewing
npm run add-source -- "Toboggan Brewing" https://www.eventbrite.ca/o/toboggan-brewing-co-58536435703 --type=eventbrite --auto-approve
```

Run a single source type with `npm run pipeline -- --type=lpl` (comma-separate several).

Imported events land in the review queue as `pending` (add `--auto-approve` to a trusted source to skip that).
Imported prices are unknown unless the source says otherwise, so the UI shows "see listing" instead of guessing "Free".
Each run is logged in the `pipeline_runs` table (fetched / inserted / updated / skipped / duplicates / failed).
To run it on a schedule, set `ENABLE_PIPELINE_CRON=true` in `server/.env` (default: daily at 3am London time, `PIPELINE_CRON`).

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
