import { NextRequest, NextResponse } from 'next/server';
import { getActiveListings, getMeta, type ListingFilters } from '@/lib/db';

export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const filters: ListingFilters = {};
  const type = params.get('type');
  if (type === 'sale' || type === 'rent') filters.type = type;
  const city = params.get('city');
  if (city) filters.city = city;
  const maxPrice = Number(params.get('maxPrice'));
  if (maxPrice > 0) filters.maxPrice = maxPrice;
  const minBeds = Number(params.get('minBeds'));
  if (minBeds > 0) filters.minBeds = minBeds;
  const buildingId = params.get('buildingId');
  if (buildingId) filters.buildingId = buildingId;

  return NextResponse.json({
    listings: getActiveListings(filters),
    lastRefreshAt: getMeta('lastRefreshAt'),
  });
}
