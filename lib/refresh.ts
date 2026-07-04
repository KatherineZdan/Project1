import {
  addNotification,
  db,
  getMeta,
  getWatchedBuildingIds,
  getWatchedExtraBuildings,
  getWatchedListingIds,
  setMeta,
} from './db';
import { provider } from './providers';

export interface RefreshResult {
  tick: number;
  active: number;
  added: number;
  priceChanges: number;
  notified: number;
  at: string;
}

function formatPrice(price: number, type: string): string {
  const p = `$${price.toLocaleString('en-CA')}`;
  return type === 'rent' ? `${p}/mo` : p;
}

export async function runRefresh(): Promise<RefreshResult> {
  const tick = Number(getMeta('refreshTick') ?? '0') + 1;
  const providerBuildings = await provider.fetchBuildings();
  // User-watched buildings discovered on the map get a simulated listing
  // stream from the mock provider; a real provider ignores this argument.
  const extraBuildings = getWatchedExtraBuildings(providerBuildings.map((b) => b.id));
  const listings = await provider.fetchActiveListings(tick, extraBuildings);
  const watchedBuildings = getWatchedBuildingIds();
  const watchedListings = getWatchedListingIds();
  const now = new Date().toISOString();

  const buildingById = new Map(
    [...providerBuildings, ...extraBuildings].map((b) => [b.id, b])
  );
  let added = 0;
  let priceChanges = 0;
  let notified = 0;

  const upsertBuilding = db.prepare(
    `INSERT INTO buildings (id, name, address, city, lat, lng) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, address = excluded.address,
       city = excluded.city, lat = excluded.lat, lng = excluded.lng`
  );
  const insertListing = db.prepare(
    `INSERT INTO listings (id, building_id, mls_number, type, price, orig_price, beds, baths, sqft, unit, status, first_seen_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
  );
  const touchListing = db.prepare(
    `UPDATE listings SET status = 'active', last_seen_at = ? WHERE id = ?`
  );
  const changePrice = db.prepare(
    `UPDATE listings SET price = ?, prev_price = ?, price_changed_at = ?, status = 'active', last_seen_at = ? WHERE id = ?`
  );

  const existingPrices = new Map(
    (db.prepare('SELECT id, price FROM listings').all() as unknown as {
      id: string;
      price: number;
    }[]).map((r) => [r.id, r.price])
  );

  db.exec('BEGIN');
  try {
    for (const b of providerBuildings) {
      upsertBuilding.run(b.id, b.name, b.address, b.city, b.lat, b.lng);
    }
    const seenIds: string[] = [];
    for (const l of listings) {
      seenIds.push(l.id);
      const building = buildingById.get(l.buildingId);
      const oldPrice = existingPrices.get(l.id);

      if (oldPrice !== undefined) {
        if (oldPrice !== l.price) {
          changePrice.run(l.price, oldPrice, now, now, l.id);
          priceChanges++;
          if (l.price < oldPrice && watchedListings.has(l.id)) {
            const pct = (((oldPrice - l.price) / oldPrice) * 100).toFixed(1);
            addNotification(
              l.buildingId,
              `Price drop at ${building?.name ?? l.buildingId}, Unit ${l.unit}: ` +
                `was ${formatPrice(oldPrice, l.type)}, now ${formatPrice(l.price, l.type)} (−${pct}%)`,
              'drop',
              l.id
            );
            notified++;
          }
        } else {
          touchListing.run(now, l.id);
        }
        continue;
      }

      insertListing.run(
        l.id, l.buildingId, l.mlsNumber, l.type, l.price, l.price,
        l.beds, l.baths, l.sqft, l.unit, now, now
      );
      added++;
      if (watchedBuildings.has(l.buildingId)) {
        const bedsLabel = l.beds === 0 ? 'Studio' : `${l.beds} bed`;
        addNotification(
          l.buildingId,
          `New ${l.type === 'sale' ? 'listing for sale' : 'rental listing'} at ${building?.name ?? l.buildingId}: ` +
            `Unit ${l.unit} — ${bedsLabel}, ${l.sqft} sqft, ${formatPrice(l.price, l.type)} (MLS ${l.mlsNumber})`,
          'new',
          l.id
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

  const result: RefreshResult = {
    tick,
    active: listings.length,
    added,
    priceChanges,
    notified,
    at: now,
  };
  console.log(
    `[refresh] tick=${tick} active=${result.active} added=${added} priceChanges=${priceChanges} notified=${notified}`
  );
  return result;
}
