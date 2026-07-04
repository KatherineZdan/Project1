import type { Building, ListingType } from '../types';
import type { ListingsProvider, SourceListing } from './types';

/**
 * Mock Ontario condo market. Real buildings and coordinates, simulated
 * inventory. Listings are generated deterministically from the refresh
 * `tick`: each tick a few new listings appear and the oldest expire, so
 * "Refresh now" behaves like a real hourly MLS sync.
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

// Listings introduced at a given tick stay on the market this many ticks.
const LISTING_LIFETIME_TICKS = 60;

function listingsForTick(tick: number): SourceListing[] {
  const rng = mulberry32(tick * 2654435761 + 1);
  const count = 1 + Math.floor(rng() * 3); // 1–3 new listings per tick
  const out: SourceListing[] = [];
  for (let i = 0; i < count; i++) {
    const building = BUILDINGS[Math.floor(rng() * BUILDINGS.length)];
    const type: ListingType = rng() < 0.6 ? 'sale' : 'rent';
    const beds = Math.floor(rng() * 4); // 0 = studio
    const baths = Math.max(1, beds - (rng() < 0.5 ? 1 : 0));
    const sqft = Math.round(380 + beds * 230 + rng() * 180);
    const factor = CITY_PRICE_FACTOR[building.city] ?? 0.7;
    const price =
      type === 'sale'
        ? Math.round((520000 + beds * 210000 + rng() * 120000) * factor / 1000) * 1000
        : Math.round((2050 + beds * 680 + rng() * 350) * factor / 25) * 25;
    const floor = 2 + Math.floor(rng() * 45);
    const unit = `${floor}0${1 + Math.floor(rng() * 8)}`;
    out.push({
      id: `mock-${tick}-${i}`,
      buildingId: building.id,
      mlsNumber: `C${String(5000000 + tick * 17 + i * 3)}`,
      type,
      price,
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
  async fetchActiveListings(tick: number) {
    // Sliding window [tick, tick + lifetime): full inventory from the first
    // refresh, and each subsequent tick adds new listings and expires the oldest.
    const listings: SourceListing[] = [];
    for (let t = tick; t < tick + LISTING_LIFETIME_TICKS; t++) {
      listings.push(...listingsForTick(t));
    }
    return listings;
  },
};
