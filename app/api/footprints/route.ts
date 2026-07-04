import { NextResponse } from 'next/server';
import { getFootprints } from '@/lib/footprints';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ footprints: await getFootprints() });
  } catch (err) {
    // Upstream (provider or Overpass) unavailable — the map still works
    // with markers and the viewport OSM layer.
    console.error('[footprints] failed:', err);
    return NextResponse.json({ footprints: {} });
  }
}
