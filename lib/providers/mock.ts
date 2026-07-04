import type { Building, ListingType } from '../types';
import type { ListingsProvider, SourceListing } from './types';

/**
 * Mock Ontario condo market. Real buildings and coordinates, simulated
 * inventory. Everything is generated deterministically from the refresh
 * `tick`, so history is stable across restarts:
 *
 * - Each tick a few new listings appear and the oldest expire, like a real
 *   hourly MLS sync.
 * - Prices drift: as a listing ages it has a small chance per tick of a
 *   2–6% price cut, which drives the price-drop tracking feature.
 * - User-watched buildings that aren't in the curated list (map-discovered
 *   OSM buildings) get their own simulated listing stream.
 */

const BUILDINGS: Building[] = [
  { id: 'one-bloor', name: 'One Bloor East', address: '1 Bloor St E', city: 'Toronto', lat: 43.6705, lng: -79.386 },
  { id: 'aura', name: 'Aura at College Park', address: '386 Yonge St', city: 'Toronto', lat: 43.6597, lng: -79.3826 },
  { id: 'ice-condos', name: 'ICE Condos', address: '12 York St', city: 'Toronto', lat: 43.6417, lng: -79.3809 },
  { id: 'parade', name: 'CityPlace Parade', address: '21 Iceboat Terr', city: 'Toronto', lat: 43.6398, lng: -79.3966 },
  { id: 'the-well', name: 'The Well Signature Series', address: '486 Front St W', city: 'Toronto', lat: 43.6428, lng: -79.3993 },
  { id: 'x-condos', name: 'X Condos', address: '110 Charles St E', city: 'Toronto', lat: 43.669, lng: -79.3823 },
  { id: 'battery-park', name: 'Battery Park (Liberty Village)', address: '85 East Liberty St', city: 'Toronto', lat: 43.6376, lng: -79.4147 },
  { id: 'shangri-la', name: 'Shangri-La Residences', address: '180 University Ave', city: 'Toronto', lat: 43.6489, lng: -79.3866 },
  { id: 'absolute-world', name: 'Absolute World', address: '60 Absolute Ave', city: 'Mississauga', lat: 43.5931, lng: -79.6423 },
  { id: 'm-city', name: 'M City', address: '3980 Confederation Pkwy', city: 'Mississauga', lat: 43.5896, lng: -79.6444 },
  { id: 'claridge-icon', name: 'Claridge Icon', address: '505 Preston St', city: 'Ottawa', lat: 45.4048, lng: -75.7108 },
  { id: 'soba', name: 'SoBa Ottawa', address: '203 Catherine St', city: 'Ottawa', lat: 45.4126, lng: -75.6935 },
  { id: 'city-square', name: 'City Square', address: '150 Charlton Ave E', city: 'Hamilton', lat: 43.2503, lng: -79.8631 },
  { id: 'azure', name: 'Azure Condos', address: '505 Talbot St', city: 'London', lat: 42.988, lng: -81.253 },
  { id: 'charlie-west', name: 'Charlie West', address: '108 Garment St', city: 'Kitchener', lat: 43.4497, lng: -80.4998 },
];

const CITY_PRICE_FACTOR: Record<string, number> = {
  Toronto: 1,
  Mississauga: 0.85,
  Ottawa: 0.75,
  Hamilton: 0.7,
  London: 0.6,
  Kitchener: 0.7,
};

// Listings introduced at a given tick stay on the market this many ticks.
const LISTING_LIFETIME_TICKS = 60;
// Chance per tick of age that a listing takes a 2–6% price cut.
const DROP_CHANCE = 0.05;
// Chance per tick that a watched map-discovered building gets a new listing.
const EXTRA_LISTING_CHANCE = 0.05;

// Deterministic PRNG so inventory history is stable across restarts.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

function roundPrice(price: number, type: ListingType): number {
  return type === 'sale' ? Math.round(price / 1000) * 1000 : Math.round(price / 25) * 25;
}

/**
 * Applies the listing's deterministic price-drop history: for each tick of
 * age, a seeded coin flip decides whether a 2–6% cut happened. Re-computed
 * identically on every refresh, so a listing's price only ever moves when it
 * gains a tick of age — exactly like a periodic feed re-sync.
 */
function priceWithDrops(listingId: string, base: number, type: ListingType, ageTicks: number): number {
  let price = base;
  const h = hashStr(listingId);
  for (let k = 1; k <= ageTicks; k++) {
    const rng = mulberry32((h + k * 2654435761) >>> 0);
    if (rng() < DROP_CHANCE) price *= 1 - (0.02 + rng() * 0.04);
  }
  return roundPrice(price, type);
}

/** Listings born in bucket `t`; `tick` (current) determines age and price. */
function curatedListingsForBucket(t: number, tick: number): SourceListing[] {
  const rng = mulberry32(t * 2654435761 + 1);
  const count = 1 + Math.floor(rng() * 3); // 1–3 new listings per bucket
  const age = tick + LISTING_LIFETIME_TICKS - 1 - t;
  const out: SourceListing[] = [];
  for (let i = 0; i < count; i++) {
    const building = BUILDINGS[Math.floor(rng() * BUILDINGS.length)];
    const type: ListingType = rng() < 0.6 ? 'sale' : 'rent';
    const beds = Math.floor(rng() * 4); // 0 = studio
    const baths = Math.max(1, beds - (rng() < 0.5 ? 1 : 0));
    const sqft = Math.round(380 + beds * 230 + rng() * 180);
    const factor = CITY_PRICE_FACTOR[building.city] ?? 0.7;
    const base =
      type === 'sale'
        ? roundPrice((520000 + beds * 210000 + rng() * 120000) * factor, type)
        : roundPrice((2050 + beds * 680 + rng() * 350) * factor, type);
    const floor = 2 + Math.floor(rng() * 45);
    const unit = `${floor}0${1 + Math.floor(rng() * 8)}`;
    const id = `mock-${t}-${i}`;
    out.push({
      id,
      buildingId: building.id,
      mlsNumber: `C${String(5000000 + t * 17 + i * 3)}`,
      type,
      price: priceWithDrops(id, base, type, age),
      beds,
      baths,
      sqft,
      unit,
    });
  }
  return out;
}

/** Simulated listing stream for a user-watched, map-discovered building. */
function extraBuildingListings(b: Building, tick: number): SourceListing[] {
  const hb = hashStr(b.id);
  const factor = CITY_PRICE_FACTOR[b.city] ?? 0.9;
  const out: SourceListing[] = [];
  for (let t = tick; t < tick + LISTING_LIFETIME_TICKS; t++) {
    const rng = mulberry32((hb ^ Math.imul(t, 40503)) >>> 0);
    if (rng() >= EXTRA_LISTING_CHANCE) continue;
    const type: ListingType = rng() < 0.6 ? 'sale' : 'rent';
    const beds = Math.floor(rng() * 4);
    const baths = Math.max(1, beds - (rng() < 0.5 ? 1 : 0));
    const sqft = Math.round(380 + beds * 230 + rng() * 180);
    const base =
      type === 'sale'
        ? roundPrice((520000 + beds * 210000 + rng() * 120000) * factor, type)
        : roundPrice((2050 + beds * 680 + rng() * 350) * factor, type);
    const floor = 2 + Math.floor(rng() * 30);
    const unit = `${floor}0${1 + Math.floor(rng() * 8)}`;
    const age = tick + LISTING_LIFETIME_TICKS - 1 - t;
    const id = `mock-${b.id}-${t}`;
    out.push({
      id,
      buildingId: b.id,
      mlsNumber: `X${String((hb % 900000) + 100000 + t)}`,
      type,
      price: priceWithDrops(id, base, type, age),
      beds,
      baths,
      sqft,
      unit,
    });
  }
  return out;
}

export const mockProvider: ListingsProvider = {
  name: 'mock-ontario',
  async fetchBuildings() {
    return BUILDINGS;
  },
  async fetchActiveListings(tick: number, extraBuildings: Building[] = []) {
    // Sliding window [tick, tick + lifetime): full inventory from the first
    // refresh, and each subsequent tick adds new listings and expires the oldest.
    const listings: SourceListing[] = [];
    for (let t = tick; t < tick + LISTING_LIFETIME_TICKS; t++) {
      listings.push(...curatedListingsForBucket(t, tick));
    }
    for (const b of extraBuildings) {
      listings.push(...extraBuildingListings(b, tick));
    }
    return listings;
  },
};
