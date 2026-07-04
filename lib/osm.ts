import type { OsmBuilding } from './types';

/**
 * Fetches residential/condo building footprints from OpenStreetMap via the
 * Overpass API for a map viewport, so every building — not just tracked
 * ones — is selectable. Results are cached in memory per rounded bbox.
 */

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const BUILDING_FILTER = '^(apartments|condominium|residential|dormitory|mixed_use)$';
const MAX_RESULTS = 400;

interface OverpassWay {
  type: string;
  id: number;
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}

const globalForOsm = globalThis as unknown as {
  __osmCache?: Map<string, OsmBuilding[]>;
};
const cache = globalForOsm.__osmCache ?? (globalForOsm.__osmCache = new Map());

export interface Bbox {
  s: number;
  w: number;
  n: number;
  e: number;
}

function cacheKey(b: Bbox): string {
  const r = (x: number) => x.toFixed(3);
  return `${r(b.s)},${r(b.w)},${r(b.n)},${r(b.e)}`;
}

export async function fetchOsmBuildings(bbox: Bbox): Promise<OsmBuilding[]> {
  const key = cacheKey(bbox);
  const cached = cache.get(key);
  if (cached) return cached;

  const query =
    `[out:json][timeout:25];` +
    `way["building"~"${BUILDING_FILTER}"](${bbox.s},${bbox.w},${bbox.n},${bbox.e});` +
    `out body geom ${MAX_RESULTS};`;
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'ontario-listings-tracker/0.1 (github.com/KatherineZdan/Project1)',
      Accept: 'application/json',
    },
    body: 'data=' + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`Overpass responded ${res.status}`);
  const json = (await res.json()) as { elements?: OverpassWay[] };

  const buildings: OsmBuilding[] = [];
  for (const el of json.elements ?? []) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 4) continue;
    let lat = 0;
    let lng = 0;
    for (const p of el.geometry) {
      lat += p.lat;
      lng += p.lon;
    }
    lat /= el.geometry.length;
    lng /= el.geometry.length;
    const tags = el.tags ?? {};
    const addr = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
    buildings.push({
      id: `osm-${el.id}`,
      name: tags.name ?? (addr || 'Residential building'),
      address: addr,
      city: tags['addr:city'] ?? 'Toronto',
      lat,
      lng,
      ring: el.geometry.map((g) => [g.lat, g.lon]),
    });
  }
  cache.set(key, buildings);
  return buildings;
}
