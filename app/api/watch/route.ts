import { NextRequest, NextResponse } from 'next/server';
import { setWatch } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.buildingId !== 'string' || typeof body.watch !== 'boolean') {
    return NextResponse.json(
      { error: 'Expected { buildingId: string, watch: boolean }' },
      { status: 400 }
    );
  }
  setWatch(body.buildingId, body.watch);
  return NextResponse.json({ ok: true });
}
