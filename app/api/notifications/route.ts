import { NextResponse } from 'next/server';
import { getNotifications, markAllNotificationsRead } from '@/lib/db';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ notifications: getNotifications() });
}

// Marks all notifications as read.
export function POST() {
  markAllNotificationsRead();
  return NextResponse.json({ ok: true });
}
