import {
  addNotification,
  db,
  getMeta,
  getWatchedBuildingIds,
  setMeta,
} from './db';
import { provider } from './providers';

export interface RefreshResult {
  tick: number;
  active: number;
  added: number;
  notified: number;
  at: string;
}

function formatPrice(price: number, type: string): string {
  const p = `$${price.toLocaleString('en-CA')}`;
  return type === 'rent' ? `${p}/mo` : p;
}

export async function runRefresh(): Promise<RefreshResult> {
  const tick = Number(getMeta('refreshTick') ?? '0') + 1;
  const buildings = await provider.fetchBuildings();
  const listings = await provider.fetchActiveListings(tick);
  const watched = getWatchedBuildingIds();
  const now = new Date().toISOString();

  const buildingById = new Map(buildings.map((b) => [b.id, b]));
  let added = 0;
  let notified = 0;

  const upsertBuilding = db.prepare(
    `INSERT INTO buildings (id, name, address, city, lat, lng) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, address = excluded.address,
       city = excluded.city, lat = excluded.lat, lng = excluded.lng`
  );
  const findListing = db.prepare('SELECT id FROM listings WHERE id = ?');
  const insertListing = db.prepare(
    `INSERT INTO listings (id, building_id, mls_number, type, price, beds, baths, sqft, unit, status, first_seen_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
  );
  const touchListing = db.prepare(
    `UPDATE listings SET price = ?, status = 'active', last_seen_at = ? WHERE id = ?`
  );

  db.exec('BEGIN');
  try {
    for (const b of buildings) {
      upsertBuilding.run(b.id, b.name, b.address, b.city, b.lat, b.lng);
    }
    const seenIds: string[] = [];
    for (const l of listings) {
      seenIds.push(l.id);
      if (findListing.get(l.id)) {
        touchListing.run(l.price, now, l.id);
        continue;
      }
      insertListing.run(
        l.id, l.buildingId, l.mlsNumber, l.type, l.price,
        l.beds, l.baths, l.sqft, l.unit, now, now
      );
      added++;
      if (watched.has(l.buildingId)) {
        const b = buildingById.get(l.buildingId);
        const bedsLabel = l.beds === 0 ? 'Studio' : `${l.beds} bed`;
        addNotification(
          l.buildingId,
          `New ${l.type === 'sale' ? 'listing for sale' : 'rental listing'} at ${b?.name ?? l.buildingId}: ` +
            `Unit ${l.unit} — ${bedsLabel}, ${l.sqft} sqft, ${formatPrice(l.price, l.type)} (MLS ${l.mlsNumber})`
        );
        notified++;
      }
    }
    // Anything the source no longer returns has left the market.
    const placeholders = seenIds.map(() => '?').join(',');
    db.prepare(
      `UPDATE listings SET status = 'inactive' WHERE status = 'active'
       ${seenIds.length ? `AND id NOT IN (${placeholders})` : ''}`
    ).run(...seenIds);
    setMeta('refreshTick', String(tick));
    setMeta('lastRefreshAt', now);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const result: RefreshResult = { tick, active: listings.length, added, notified, at: now };
  console.log(
    `[refresh] tick=${tick} active=${result.active} added=${added} notified=${notified}`
  );
  return result;
}
