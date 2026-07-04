'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type {
  AppNotification,
  BuildingWithStats,
  ListingWithBuilding,
} from '@/lib/types';

const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => <div className="map-loading">Loading map…</div>,
});

type Tab = 'listings' | 'watchlist' | 'alerts';

interface Filters {
  type: '' | 'sale' | 'rent';
  city: string;
  maxPrice: string;
  minBeds: string;
}

function formatPrice(price: number, type: string): string {
  const p = `$${price.toLocaleString('en-CA')}`;
  return type === 'rent' ? `${p}/mo` : p;
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const isNew = (iso: string) => Date.now() - new Date(iso).getTime() < 24 * 3600 * 1000;

export default function AppShell() {
  const [tab, setTab] = useState<Tab>('listings');
  const [buildings, setBuildings] = useState<BuildingWithStats[]>([]);
  const [listings, setListings] = useState<ListingWithBuilding[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    type: '',
    city: '',
    maxPrice: '',
    minBeds: '',
  });

  const loadAll = useCallback(async () => {
    const qs = new URLSearchParams();
    if (filters.type) qs.set('type', filters.type);
    if (filters.city) qs.set('city', filters.city);
    if (filters.maxPrice) qs.set('maxPrice', filters.maxPrice);
    if (filters.minBeds) qs.set('minBeds', filters.minBeds);
    const [bRes, lRes, nRes] = await Promise.all([
      fetch('/api/buildings'),
      fetch(`/api/listings?${qs}`),
      fetch('/api/notifications'),
    ]);
    const b = await bRes.json();
    const l = await lRes.json();
    const n = await nRes.json();
    setBuildings(b.buildings);
    setListings(l.listings);
    setLastRefreshAt(l.lastRefreshAt);
    setNotifications(n.notifications);
  }, [filters]);

  useEffect(() => {
    loadAll();
    const timer = setInterval(loadAll, 30000);
    return () => clearInterval(timer);
  }, [loadAll]);

  const toggleWatch = useCallback(
    async (buildingId: string, watch: boolean) => {
      await fetch('/api/watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildingId, watch }),
      });
      await loadAll();
    },
    [loadAll]
  );

  const refreshNow = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch('/api/refresh', { method: 'POST' });
      await loadAll();
    } finally {
      setRefreshing(false);
    }
  }, [loadAll]);

  const markAllRead = useCallback(async () => {
    await fetch('/api/notifications', { method: 'POST' });
    await loadAll();
  }, [loadAll]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const watchedBuildings = buildings.filter((b) => b.watched);
  const cities = useMemo(
    () => Array.from(new Set(buildings.map((b) => b.city))).sort(),
    [buildings]
  );
  const visibleListings = selectedBuildingId
    ? listings.filter((l) => l.buildingId === selectedBuildingId)
    : listings;
  const selectedBuilding = buildings.find((b) => b.id === selectedBuildingId);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">◈</span>
          <div>
            <h1>Ontario Listings Tracker</h1>
            <span className="brand-sub">
              {lastRefreshAt ? `Data refreshed ${timeAgo(lastRefreshAt)}` : 'Loading…'} · auto-refreshes hourly
            </span>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="btn" onClick={refreshNow} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : '⟳ Refresh now'}
          </button>
          <button
            className={`bell${unreadCount ? ' has-unread' : ''}`}
            onClick={() => setTab('alerts')}
            title="Notifications"
          >
            🔔
            {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
          </button>
        </div>
      </header>

      <div className="main">
        <aside className="sidebar">
          <nav className="tabs">
            <button className={tab === 'listings' ? 'active' : ''} onClick={() => setTab('listings')}>
              Listings ({listings.length})
            </button>
            <button className={tab === 'watchlist' ? 'active' : ''} onClick={() => setTab('watchlist')}>
              Watchlist ({watchedBuildings.length})
            </button>
            <button className={tab === 'alerts' ? 'active' : ''} onClick={() => setTab('alerts')}>
              Alerts{unreadCount ? ` (${unreadCount})` : ''}
            </button>
          </nav>

          {tab === 'listings' && (
            <>
              <div className="filters">
                <select
                  value={filters.type}
                  onChange={(e) => setFilters({ ...filters, type: e.target.value as Filters['type'] })}
                >
                  <option value="">Buy & Rent</option>
                  <option value="sale">For Sale</option>
                  <option value="rent">For Rent</option>
                </select>
                <select
                  value={filters.city}
                  onChange={(e) => setFilters({ ...filters, city: e.target.value })}
                >
                  <option value="">All cities</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Max price"
                  value={filters.maxPrice}
                  onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })}
                />
                <select
                  value={filters.minBeds}
                  onChange={(e) => setFilters({ ...filters, minBeds: e.target.value })}
                >
                  <option value="">Any beds</option>
                  <option value="1">1+ beds</option>
                  <option value="2">2+ beds</option>
                  <option value="3">3+ beds</option>
                </select>
              </div>
              {selectedBuildingId && (
                <button className="clear-filter" onClick={() => setSelectedBuildingId(null)}>
                  ✕ Showing one building — clear
                </button>
              )}
              <div className="list">
                {visibleListings.length === 0 && (
                  <p className="empty">No active listings match these filters.</p>
                )}
                {visibleListings.map((l) => (
                  <button
                    key={l.id}
                    className="card"
                    onClick={() => setSelectedBuildingId(l.buildingId)}
                  >
                    <div className="card-top">
                      <span className="price">{formatPrice(l.price, l.type)}</span>
                      <span className={`tag ${l.type}`}>{l.type === 'sale' ? 'Sale' : 'Rent'}</span>
                      {isNew(l.firstSeenAt) && <span className="tag new">NEW</span>}
                    </div>
                    <div className="card-title">
                      {l.buildingName} · Unit {l.unit}
                    </div>
                    <div className="card-sub">
                      {l.beds === 0 ? 'Studio' : `${l.beds} bd`} · {l.baths} ba · {l.sqft} sqft
                      · {l.city} · MLS {l.mlsNumber}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {tab === 'watchlist' && (
            <div className="list">
              {watchedBuildings.length === 0 && (
                <p className="empty">
                  You aren&apos;t watching any buildings yet. Click a building on the map and
                  hit &ldquo;Watch this building&rdquo; — you&apos;ll get an alert whenever a new
                  listing appears there.
                </p>
              )}
              {watchedBuildings.map((b) => (
                <div key={b.id} className="card static">
                  <div className="card-title">★ {b.name}</div>
                  <div className="card-sub">
                    {b.address}, {b.city} · {b.saleCount} for sale · {b.rentCount} for rent
                  </div>
                  <div className="card-actions">
                    <button className="mini" onClick={() => setSelectedBuildingId(b.id)}>
                      View on map
                    </button>
                    <button className="mini danger" onClick={() => toggleWatch(b.id, false)}>
                      Unwatch
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'alerts' && (
            <div className="list">
              {notifications.length > 0 && (
                <button className="clear-filter" onClick={markAllRead}>
                  Mark all as read
                </button>
              )}
              {notifications.length === 0 && (
                <p className="empty">
                  No alerts yet. Watch a building and you&apos;ll be notified here when new
                  listings appear in it.
                </p>
              )}
              {notifications.map((n) => (
                <button
                  key={n.id}
                  className={`card notif${n.read ? '' : ' unread'}`}
                  onClick={() => setSelectedBuildingId(n.buildingId)}
                >
                  <div className="card-sub">{timeAgo(n.createdAt)}</div>
                  <div className="notif-msg">{n.message}</div>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="map-pane">
          <MapView
            buildings={buildings}
            selectedBuildingId={selectedBuildingId}
            onSelectBuilding={setSelectedBuildingId}
          />
          {selectedBuilding && (
            <div className="building-card">
              <button
                className="building-card-close"
                onClick={() => setSelectedBuildingId(null)}
                title="Close"
              >
                ✕
              </button>
              <strong>{selectedBuilding.name}</strong>
              <div className="building-card-sub">
                {selectedBuilding.address}, {selectedBuilding.city}
              </div>
              <div className="building-card-sub">
                {selectedBuilding.saleCount} for sale · {selectedBuilding.rentCount} for rent
              </div>
              <button
                className={`watch-btn${selectedBuilding.watched ? ' on' : ''}`}
                onClick={() => toggleWatch(selectedBuilding.id, !selectedBuilding.watched)}
              >
                {selectedBuilding.watched
                  ? '★ Watching — click to stop'
                  : '☆ Watch this building'}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
