import { NextResponse } from 'next/server';
import { getBuildingsWithStats } from '@/lib/db';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ buildings: getBuildingsWithStats() });
}
