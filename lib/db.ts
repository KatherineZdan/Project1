import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import type {
  AppNotification,
  Building,
  BuildingWithStats,
  ListingWithBuilding,
  NotificationKind,
  Ring,
} from './types';

const DATA_DIR = path.join(process.cwd(), 'data');

function createDb(): DatabaseSync {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS buildings (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      footprint TEXT
    );
    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      building_id TEXT NOT NULL REFERENCES buildings(id),
      mls_number TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('sale', 'rent')),
      price INTEGER NOT NULL,
      orig_price INTEGER,
      prev_price INTEGER,
      price_changed_at TEXT,
      beds INTEGER NOT NULL,
      baths INTEGER NOT NULL,
      sqft INTEGER NOT NULL,
      unit TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_listings_building ON listings(building_id);
    CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
    CREATE TABLE IF NOT EXISTS watches (
      building_id TEXT PRIMARY KEY REFERENCES buildings(id),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS watched_listings (
      listing_id TEXT PRIMARY KEY REFERENCES listings(id),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      building_id TEXT NOT NULL REFERENCES buildings(id),
      listing_id TEXT,
      kind TEXT NOT NULL DEFAULT 'new',
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  migrate(db);
  return db;
}

// Additive migrations for databases created before these columns existed.
function migrate(db: DatabaseSync): void {
  const tryExec = (sql: string) => {
    try {
      db.exec(sql);
    } catch {
      /* column already exists */
    }
  };
  tryExec(`ALTER TABLE buildings ADD COLUMN footprint TEXT`);
  tryExec(`ALTER TABLE listings ADD COLUMN orig_price INTEGER`);
  tryExec(`ALTER TABLE listings ADD COLUMN prev_price INTEGER`);
  tryExec(`ALTER TABLE listings ADD COLUMN price_changed_at TEXT`);
  tryExec(`ALTER TABLE notifications ADD COLUMN listing_id TEXT`);
  tryExec(`ALTER TABLE notifications ADD COLUMN kind TEXT NOT NULL DEFAULT 'new'`);
  db.exec(`UPDATE listings SET orig_price = price WHERE orig_price IS NULL`);
}

// Survive Next.js dev-mode HMR without opening a new connection per reload.
const globalForDb = globalThis as unknown as { __appDb?: DatabaseSync };
export const db = globalForDb.__appDb ?? (globalForDb.__appDb = createDb());

export function getMeta(key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

export function getBuildingsWithStats(): BuildingWithStats[] {
  const rows = db
    .prepare(
      `SELECT b.id, b.name, b.address, b.city, b.lat, b.lng, b.footprint,
        COALESCE(SUM(CASE WHEN l.status = 'active' AND l.type = 'sale' THEN 1 ELSE 0 END), 0) AS saleCount,
        COALESCE(SUM(CASE WHEN l.status = 'active' AND l.type = 'rent' THEN 1 ELSE 0 END), 0) AS rentCount,
        CASE WHEN w.building_id IS NULL THEN 0 ELSE 1 END AS watched
      FROM buildings b
      LEFT JOIN listings l ON l.building_id = b.id
      LEFT JOIN watches w ON w.building_id = b.id
      GROUP BY b.id
      ORDER BY b.city, b.name`
    )
    .all() as unknown as (Omit<BuildingWithStats, 'watched' | 'footprint'> & {
    watched: number;
    footprint: string | null;
  })[];
  return rows.map((r) => ({
    ...r,
    watched: !!r.watched,
    footprint: r.footprint ? (JSON.parse(r.footprint) as Ring) : null,
  }));
}

/** Insert a building the user discovered on the map (no-op if it exists). */
export function insertBuildingIfMissing(b: Building, footprint?: Ring | null): void {
  db.prepare(
    `INSERT INTO buildings (id, name, address, city, lat, lng, footprint)
     VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`
  ).run(b.id, b.name, b.address, b.city, b.lat, b.lng, footprint ? JSON.stringify(footprint) : null);
}

/** Watched buildings that did not come from the listings provider. */
export function getWatchedExtraBuildings(providerIds: string[]): Building[] {
  const rows = db
    .prepare(
      `SELECT b.id, b.name, b.address, b.city, b.lat, b.lng
       FROM buildings b JOIN watches w ON w.building_id = b.id`
    )
    .all() as unknown as Building[];
  const skip = new Set(providerIds);
  return rows.filter((r) => !skip.has(r.id));
}

export interface ListingFilters {
  type?: 'sale' | 'rent';
  city?: string;
  maxPrice?: number;
  minBeds?: number;
  buildingId?: string;
  watchedOnly?: boolean;
}

export function getActiveListings(filters: ListingFilters = {}): ListingWithBuilding[] {
  const clauses = [`l.status = 'active'`];
  const params: (string | number)[] = [];
  if (filters.type) {
    clauses.push('l.type = ?');
    params.push(filters.type);
  }
  if (filters.city) {
    clauses.push('b.city = ?');
    params.push(filters.city);
  }
  if (filters.maxPrice) {
    clauses.push('l.price <= ?');
    params.push(filters.maxPrice);
  }
  if (filters.minBeds) {
    clauses.push('l.beds >= ?');
    params.push(filters.minBeds);
  }
  if (filters.buildingId) {
    clauses.push('l.building_id = ?');
    params.push(filters.buildingId);
  }
  if (filters.watchedOnly) {
    clauses.push('wl.listing_id IS NOT NULL');
  }
  const rows = db
    .prepare(
      `SELECT l.id, l.building_id AS buildingId, l.mls_number AS mlsNumber, l.type, l.price,
        l.orig_price AS origPrice, l.prev_price AS prevPrice, l.price_changed_at AS priceChangedAt,
        l.beds, l.baths, l.sqft, l.unit, l.status,
        l.first_seen_at AS firstSeenAt, l.last_seen_at AS lastSeenAt,
        b.name AS buildingName, b.address, b.city, b.lat, b.lng,
        CASE WHEN wl.listing_id IS NULL THEN 0 ELSE 1 END AS watched
      FROM listings l
      JOIN buildings b ON b.id = l.building_id
      LEFT JOIN watched_listings wl ON wl.listing_id = l.id
      WHERE ${clauses.join(' AND ')}
      ORDER BY l.first_seen_at DESC, l.id`
    )
    .all(...params) as unknown as (Omit<ListingWithBuilding, 'watched'> & { watched: number })[];
  return rows.map((r) => ({ ...r, watched: !!r.watched }));
}

export function setWatch(buildingId: string, watch: boolean): void {
  if (watch) {
    db.prepare(
      'INSERT OR IGNORE INTO watches (building_id, created_at) VALUES (?, ?)'
    ).run(buildingId, new Date().toISOString());
  } else {
    db.prepare('DELETE FROM watches WHERE building_id = ?').run(buildingId);
  }
}

export function getWatchedBuildingIds(): Set<string> {
  const rows = db.prepare('SELECT building_id FROM watches').all() as unknown as {
    building_id: string;
  }[];
  return new Set(rows.map((r) => r.building_id));
}

export function setListingWatch(listingId: string, watch: boolean): void {
  if (watch) {
    db.prepare(
      'INSERT OR IGNORE INTO watched_listings (listing_id, created_at) VALUES (?, ?)'
    ).run(listingId, new Date().toISOString());
  } else {
    db.prepare('DELETE FROM watched_listings WHERE listing_id = ?').run(listingId);
  }
}

export function getWatchedListingIds(): Set<string> {
  const rows = db.prepare('SELECT listing_id FROM watched_listings').all() as unknown as {
    listing_id: string;
  }[];
  return new Set(rows.map((r) => r.listing_id));
}

export function addNotification(
  buildingId: string,
  message: string,
  kind: NotificationKind = 'new',
  listingId: string | null = null
): void {
  db.prepare(
    'INSERT INTO notifications (building_id, listing_id, kind, message, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(buildingId, listingId, kind, message, new Date().toISOString());
}

export function getNotifications(limit = 50): AppNotification[] {
  const rows = db
    .prepare(
      `SELECT n.id, n.building_id AS buildingId, b.name AS buildingName,
        n.message, n.kind, n.created_at AS createdAt, n.read
      FROM notifications n
      JOIN buildings b ON b.id = n.building_id
      ORDER BY n.id DESC LIMIT ?`
    )
    .all(limit) as unknown as (Omit<AppNotification, 'read'> & { read: number })[];
  return rows.map((r) => ({ ...r, read: !!r.read }));
}

export function markAllNotificationsRead(): void {
  db.prepare('UPDATE notifications SET read = 1 WHERE read = 0').run();
}
