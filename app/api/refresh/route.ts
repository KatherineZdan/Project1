import { NextResponse } from 'next/server';
import { runRefresh } from '@/lib/refresh';

export const dynamic = 'force-dynamic';

export async function POST() {
  const result = await runRefresh();
  return NextResponse.json(result);
}
