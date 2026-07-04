import { NextRequest, NextResponse } from 'next/server';
import { setListingWatch } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.listingId !== 'string' || typeof body.watch !== 'boolean') {
    return NextResponse.json(
      { error: 'Expected { listingId: string, watch: boolean }' },
      { status: 400 }
    );
  }
  setListingWatch(body.listingId, body.watch);
  return NextResponse.json({ ok: true });
}
