# Getting real MLS data

This app ships with a simulated Ontario listings feed. Here's the honest
picture on real data, and how to plug it in.

## Why not scrape realtor.ca?

realtor.ca is operated by CREA (the Canadian Real Estate Association). It has
**no public API**, its [Terms of Use](https://www.realtor.ca/terms-of-use)
explicitly prohibit automated scraping, and the site sits behind commercial
anti-bot protection. CREA has pursued legal action against scrapers. Building
this product on scraped realtor.ca data would be legally risky and would break
without warning whenever their defenses change — so this project doesn't do it.

## Legitimate options

1. **CREA DDF® (Data Distribution Facility)** — CREA's official national
   listings feed (the same data behind realtor.ca). Access requires being a
   REALTOR® member, a brokerage, or an approved technology provider with a
   signed agreement. Details: https://www.crea.ca/technology/ddf/
   The modern feed is RESO Web API compliant (OData/JSON).

2. **Repliers** (https://repliers.com) — a commercial API over Canadian MLS
   data (including TRREB/Ontario). You still need data licensing (they help
   broker it), but the API is developer-friendly: REST, webhooks for new
   listings, historical data.

3. **Regional boards directly** — e.g. TRREB (Toronto), OREB (Ottawa) offer
   RESO Web API feeds to members and their vendors.

4. **Partner with a REALTOR®** — a common path for apps like this one: a
   licensed agent sponsors data access and the app operates under their
   brokerage's agreement.

## The DDF provider is already built in

[lib/providers/ddf.ts](lib/providers/ddf.ts) implements the full CREA DDF®
RESO Web API client: OAuth2 client-credentials auth, paginated OData
Property queries, and mapping into this app's data model. To activate:

1. Register for DDF access at https://www.crea.ca/technology/ddf/ (free for
   REALTOR® members; technology providers sign a data agreement). CREA also
   offers sandbox credentials with sample data for development.
2. `cp .env.example .env.local` and fill in `DDF_CLIENT_ID` and
   `DDF_CLIENT_SECRET`.
3. Restart the server. The console logs `[provider] using live CREA DDF MLS
   data` and the header badge flips to *Live MLS data (CREA DDF)*.

The default query pulls active Ontario apartment/condo listings; tune it
with `DDF_FILTER` (any OData `$filter` over RESO Property fields) and
`DDF_MAX_PAGES`.

To integrate a different vendor (e.g. Repliers), implement the same
`ListingsProvider` interface ([lib/providers/types.ts](lib/providers/types.ts))
and select it in [lib/providers/index.ts](lib/providers/index.ts). The
refresh engine handles the rest: diffing against the local database,
expiring delisted units, detecting price drops, and notifying watchers.
