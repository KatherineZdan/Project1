import { NextRequest, NextResponse } from 'next/server';
import { insertBuildingIfMissing, setWatch } from '@/lib/db';
import type { Ring } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface WatchBody {
  buildingId: string;
  watch: boolean;
  // Present when watching a building not yet tracked (map-discovered).
  building?: {
    id: string;
    name: string;
    address: string;
    city: string;
    lat: number;
    lng: number;
    footprint?: Ring;
  };
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as WatchBody | null;
  if (!body || typeof body.buildingId !== 'string' || typeof body.watch !== 'boolean') {
    return NextResponse.json(
      { error: 'Expected { buildingId: string, watch: boolean }' },
      { status: 400 }
    );
  }
  const b = body.building;
  if (b && b.id === body.buildingId && typeof b.lat === 'number' && typeof b.lng === 'number') {
    insertBuildingIfMissing(
      {
        id: b.id,
        name: String(b.name || 'Residential building'),
        address: String(b.address ?? ''),
        city: String(b.city || 'Toronto'),
        lat: b.lat,
        lng: b.lng,
      },
      Array.isArray(b.footprint) ? b.footprint : null
    );
  }
  setWatch(body.buildingId, body.watch);
  return NextResponse.json({ ok: true });
}
