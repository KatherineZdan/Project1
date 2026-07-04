import { NextResponse } from 'next/server';
import { getFootprints } from '@/lib/footprints';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ footprints: await getFootprints() });
}
