import fs from 'fs';
import path from 'path';
import type { Building } from './types';
import { provider } from './providers';


/**
 * Building footprint polygons for the map, sourced from OpenStreetMap via
 * the Overpass API (ODbL-licensed, attribution already on the map tiles).
 * Fetched once and cached to data/footprints.json; buildings without an
 * OSM match fall back to a small square so they stay clickable.
 */

import type { Ring } from './types';
export type { Ring };

const CACHE_FILE = path.join(process.cwd(), 'data', 'footprints.json');
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const MATCH_RADIUS_M = 80;

interface OverpassWay {
  type: string;
  geometry?: { lat: number; lon: number }[];
}

function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = (bLat - aLat) * 111320;
  const dLng = (bLng - aLng) * 111320 * Math.cos((aLat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

function centroid(geom: { lat: number; lon: number }[]): { lat: number; lon: number } {
  let lat = 0;
  let lon = 0;
  for (const p of geom) {
    lat += p.lat;
    lon += p.lon;
  }
  return { lat: lat / geom.length, lon: lon / geom.length };
}

async function fetchFromOverpass(buildings: Building[]): Promise<Record<string, Ring>> {
  const clauses = buildings
    .map((b) => `way(around:70,${b.lat},${b.lng})["building"];`)
    .join('');
  const query = `[out:json][timeout:25];(${clauses});out body geom;`;
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // Overpass usage policy requires an identifying User-Agent.
      'User-Agent': 'ontario-listings-tracker/0.1 (github.com/KatherineZdan/Project1)',
      Accept: 'application/json',
    },
    body: 'data=' + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`Overpass responded ${res.status}`);
  const json = (await res.json()) as { elements?: OverpassWay[] };
  const ways = (json.elements ?? []).filter(
    (el) => el.type === 'way' && el.geometry && el.geometry.length >= 4
  );

  const out: Record<string, Ring> = {};
  for (const b of buildings) {
    let best: OverpassWay | null = null;
    let bestDist = Infinity;
    for (const way of ways) {
      const c = centroid(way.geometry!);
      const d = metersBetween(b.lat, b.lng, c.lat, c.lon);
      if (d < bestDist && d < MATCH_RADIUS_M) {
        bestDist = d;
        best = way;
      }
    }
    if (best) out[b.id] = best.geometry!.map((g) => [g.lat, g.lon]);
  }
  return out;
}

function fallbackSquare(b: Building): Ring {
  const half = 25; // meters
  const dLat = half / 111320;
  const dLng = dLat / Math.cos((b.lat * Math.PI) / 180);
  return [
    [b.lat - dLat, b.lng - dLng],
    [b.lat - dLat, b.lng + dLng],
    [b.lat + dLat, b.lng + dLng],
    [b.lat + dLat, b.lng - dLng],
  ];
}

const globalForFp = globalThis as unknown as {
  __footprints?: Record<string, Ring>;
};

// Above this many buildings (live MLS scale), skip the bulk Overpass fetch:
// tracked buildings fall back to small squares, and the viewport OSM layer
// already provides real footprints where the user is looking.
const MAX_OVERPASS_BUILDINGS = 50;

export async function getFootprints(): Promise<Record<string, Ring>> {
  if (globalForFp.__footprints) return globalForFp.__footprints;

  const buildings = await provider.fetchBuildings();
  if (buildings.length > MAX_OVERPASS_BUILDINGS) {
    const result: Record<string, Ring> = {};
    for (const b of buildings) result[b.id] = fallbackSquare(b);
    globalForFp.__footprints = result;
    return result;
  }
  let fetched: Record<string, Ring> = {};
  if (fs.existsSync(CACHE_FILE)) {
    fetched = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } else {
    try {
      fetched = await fetchFromOverpass(buildings);
      fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify(fetched));
      console.log(
        `[footprints] fetched ${Object.keys(fetched).length}/${buildings.length} from OSM`
      );
    } catch (err) {
      console.error('[footprints] Overpass fetch failed, using fallbacks:', err);
    }
  }

  const result: Record<string, Ring> = {};
  for (const b of buildings) {
    result[b.id] = fetched[b.id] ?? fallbackSquare(b);
  }
  globalForFp.__footprints = result;
  return result;
}
