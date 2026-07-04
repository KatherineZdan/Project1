import { NextRequest, NextResponse } from 'next/server';
import { fetchOsmBuildings } from '@/lib/osm';

export const dynamic = 'force-dynamic';

// Max bbox span in degrees (~9 km) — keeps Overpass queries small and fast.
const MAX_SPAN = 0.08;

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('bbox') ?? '';
  const parts = raw.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return NextResponse.json({ error: 'Expected bbox=s,w,n,e' }, { status: 400 });
  }
  const [s, w, n, e] = parts;
  if (n <= s || e <= w || n - s > MAX_SPAN || e - w > MAX_SPAN) {
    return NextResponse.json({ error: 'bbox too large or invalid' }, { status: 400 });
  }
  try {
    return NextResponse.json({ buildings: await fetchOsmBuildings({ s, w, n, e }) });
  } catch (err) {
    console.error('[osm-buildings] fetch failed:', err);
    return NextResponse.json({ buildings: [], error: 'upstream unavailable' }, { status: 200 });
  }
}
