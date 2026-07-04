import type { Building, ListingType } from '../types';
import type { ListingsProvider, SourceListing } from './types';

/**
 * CREA DDF® provider — live Canadian MLS data via CREA's official RESO Web
 * API (the same data behind realtor.ca). Requires licensed credentials:
 * register at https://www.crea.ca/technology/ddf/ and put them in .env.local:
 *
 *   DDF_CLIENT_ID=...
 *   DDF_CLIENT_SECRET=...
 *
 * Optional overrides:
 *   DDF_TOKEN_URL   (default https://identity.crea.ca/connect/token)
 *   DDF_BASE_URL    (default https://ddfapi.realtor.ca)
 *   DDF_FILTER      (default: active Ontario apartment/condo listings)
 *   DDF_MAX_PAGES   (default 25 → up to 2,500 listings per sync)
 *
 * Auth is OAuth2 client-credentials; listings come from the OData Property
 * resource with @odata.nextLink pagination. Buildings are derived by
 * grouping listings on street address + city.
 */

const TOKEN_URL = process.env.DDF_TOKEN_URL ?? 'https://identity.crea.ca/connect/token';
const BASE_URL = process.env.DDF_BASE_URL ?? 'https://ddfapi.realtor.ca';
const DEFAULT_FILTER =
  "StandardStatus eq 'Active' and StateOrProvince eq 'ON' and PropertySubType eq 'Apartment'";
const FILTER = process.env.DDF_FILTER ?? DEFAULT_FILTER;
const MAX_PAGES = Number(process.env.DDF_MAX_PAGES ?? 25);
const PAGE_SIZE = 100;
const SNAPSHOT_TTL_MS = 60_000;

export const ddfConfigured = Boolean(
  process.env.DDF_CLIENT_ID && process.env.DDF_CLIENT_SECRET
);

interface DdfRecord {
  ListingKey?: string;
  ListingId?: string;
  ListPrice?: number;
  TransactionType?: string;
  BedroomsTotal?: number;
  BathroomsTotalInteger?: number;
  LivingArea?: number;
  BuildingAreaTotal?: number;
  UnitNumber?: string;
  StreetNumber?: string;
  StreetName?: string;
  StreetSuffix?: string;
  UnparsedAddress?: string;
  City?: string;
  Latitude?: number;
  Longitude?: number;
}

interface Snapshot {
  buildings: Building[];
  listings: SourceListing[];
  at: number;
}

const globalForDdf = globalThis as unknown as {
  __ddfToken?: { token: string; expiresAt: number };
  __ddfSnapshot?: Snapshot;
};

async function getToken(): Promise<string> {
  const cached = globalForDdf.__ddfToken;
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.DDF_CLIENT_ID ?? '',
      client_secret: process.env.DDF_CLIENT_SECRET ?? '',
      scope: 'DDFApi_Read',
    }),
  });
  if (!res.ok) {
    throw new Error(`DDF token request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in?: number };
  globalForDdf.__ddfToken = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return json.access_token;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/** Street address without the unit — the building's identity. */
function buildingAddress(r: DdfRecord): string | null {
  if (r.StreetNumber && r.StreetName) {
    return [r.StreetNumber, r.StreetName, r.StreetSuffix].filter(Boolean).join(' ');
  }
  // UnparsedAddress is commonly "UNIT - NUMBER STREET" in DDF.
  const unparsed = (r.UnparsedAddress ?? '').split(' - ').pop()?.trim();
  return unparsed || null;
}

function mapType(transactionType: string | undefined): ListingType {
  return /rent|lease/i.test(transactionType ?? '') ? 'rent' : 'sale';
}

async function fetchSnapshot(): Promise<Snapshot> {
  const cached = globalForDdf.__ddfSnapshot;
  if (cached && Date.now() - cached.at < SNAPSHOT_TTL_MS) return cached;

  const token = await getToken();
  const listings: SourceListing[] = [];
  const buildings = new Map<string, Building>();

  let url: string | null =
    `${BASE_URL}/odata/v1/Property?$filter=${encodeURIComponent(FILTER)}&$top=${PAGE_SIZE}`;
  for (let page = 0; page < MAX_PAGES && url; page++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`DDF Property request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    }
    const json = (await res.json()) as { value?: DdfRecord[]; '@odata.nextLink'?: string };

    for (const r of json.value ?? []) {
      const lat = Number(r.Latitude);
      const lng = Number(r.Longitude);
      const price = Number(r.ListPrice);
      const address = buildingAddress(r);
      if (!r.ListingKey || !address || !r.City || !Number.isFinite(lat) || !Number.isFinite(lng) || !(price > 0)) {
        continue; // skip records missing the essentials
      }
      const buildingId = `mls-${slugify(`${r.City}-${address}`)}`;
      if (!buildings.has(buildingId)) {
        buildings.set(buildingId, {
          id: buildingId,
          name: address,
          address,
          city: r.City,
          lat,
          lng,
        });
      }
      listings.push({
        id: `ddf-${r.ListingKey}`,
        buildingId,
        mlsNumber: r.ListingId ?? r.ListingKey,
        type: mapType(r.TransactionType),
        price: Math.round(price),
        beds: Number(r.BedroomsTotal) || 0,
        baths: Number(r.BathroomsTotalInteger) || 1,
        sqft: Math.round(Number(r.LivingArea) || Number(r.BuildingAreaTotal) || 0),
        unit: String(r.UnitNumber ?? '').trim() || '—',
      });
    }
    url = json['@odata.nextLink'] ?? null;
  }

  const snapshot: Snapshot = {
    buildings: [...buildings.values()],
    listings,
    at: Date.now(),
  };
  globalForDdf.__ddfSnapshot = snapshot;
  console.log(
    `[ddf] synced ${listings.length} active listings across ${snapshot.buildings.length} buildings`
  );
  return snapshot;
}

export const ddfProvider: ListingsProvider = {
  name: 'crea-ddf',
  async fetchBuildings() {
    return (await fetchSnapshot()).buildings;
  },
  // Live data covers every building already, so extraBuildings is ignored.
  async fetchActiveListings() {
    return (await fetchSnapshot()).listings;
  },
};
