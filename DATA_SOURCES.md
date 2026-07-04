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

## How to plug one in

Implement the `ListingsProvider` interface in
[lib/providers/types.ts](lib/providers/types.ts):

```ts
export const ddfProvider: ListingsProvider = {
  name: 'crea-ddf',
  async fetchBuildings() { /* map RESO Property records to buildings */ },
  async fetchActiveListings(_tick) { /* query active listings, map fields */ },
};
```

Then switch one line in [lib/providers/index.ts](lib/providers/index.ts):

```ts
export const provider: ListingsProvider = ddfProvider;
```

The refresh engine (`lib/refresh.ts`) handles the rest: diffing against the
local database, expiring delisted units, and notifying watchers of new
listings. Nothing else in the app needs to change.
