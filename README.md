# Ontario Listings Tracker

Track condo, home, and rental listings across Ontario on an interactive map,
watch the specific buildings you care about, and get alerted the moment a new
listing appears in one of them.

## Features

- **Interactive map** (Leaflet + CARTO Positron basemap — streets and
  buildings only, no POI clutter) of buildings across Ontario — Toronto,
  Mississauga, Ottawa, Hamilton, London, Kitchener — with live listing
  counts per building.
- **Clickable building footprints** — real building outlines (sourced once
  from OpenStreetMap via Overpass, cached in `data/footprints.json`) are
  drawn on the map; hover highlights them, clicking selects the building
  and lets you add it to your watchlist right from the map.
- **Listings browser** with filters: buy/rent, city, max price, min bedrooms.
- **Building watchlist** — click any building marker and hit *Watch this
  building*. Watched buildings show gold on the map.
- **Alerts** — every refresh, new listings in watched buildings generate
  notifications (bell icon with unread count, alerts tab).
- **Hourly auto-refresh** — a background scheduler syncs listings from the
  data provider every hour (configurable via `REFRESH_INTERVAL_MS`), plus a
  *Refresh now* button.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000. The database (SQLite, in `data/`) is created and
seeded on first boot.

## Data source

The app currently runs on a **simulated Ontario MLS feed** (real buildings,
generated listings) because realtor.ca has no public API and prohibits
scraping. The data layer is a single pluggable interface
([lib/providers/types.ts](lib/providers/types.ts)) — see
[DATA_SOURCES.md](DATA_SOURCES.md) for how to connect licensed, real MLS data
(CREA DDF, Repliers, etc.).

## Architecture

- **Next.js 15 (App Router) + TypeScript** — UI and API routes.
- **SQLite** (Node's built-in `node:sqlite`, no native deps) — buildings,
  listings, watches, notifications.
- **`instrumentation.ts`** — starts the hourly refresh loop on server boot.
- **`lib/refresh.ts`** — sync engine: upserts the provider snapshot, detects
  new listings, marks delisted units inactive, and fans out notifications for
  watched buildings.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `REFRESH_INTERVAL_MS` | `3600000` (1 h) | Background refresh cadence |
