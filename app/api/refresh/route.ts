import { NextResponse } from 'next/server';
import { runRefresh } from '@/lib/refresh';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    return NextResponse.json(await runRefresh());
  } catch (err) {
    console.error('[refresh] manual refresh failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'refresh failed' },
      { status: 502 }
    );
  }
}
