'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  OSM_MIN_ZOOM,
  type AppNotification,
  type BuildingWithStats,
  type ListingWithBuilding,
  type OsmBuilding,
  type Ring,
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
  const [watchedListings, setWatchedListings] = useState<ListingWithBuilding[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [providerName, setProviderName] = useState<string | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [selectedOsm, setSelectedOsm] = useState<OsmBuilding | null>(null);
  const [osmBuildings, setOsmBuildings] = useState<OsmBuilding[]>([]);
  const [mapZoom, setMapZoom] = useState(7);
  const [footprints, setFootprints] = useState<Record<string, Ring>>({});
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
    const [bRes, lRes, wRes, nRes] = await Promise.all([
      fetch('/api/buildings'),
      fetch(`/api/listings?${qs}`),
      fetch('/api/listings?watchedOnly=1'),
      fetch('/api/notifications'),
    ]);
    const b = await bRes.json();
    const l = await lRes.json();
    const w = await wRes.json();
    const n = await nRes.json();
    setBuildings(b.buildings);
    setListings(l.listings);
    setWatchedListings(w.listings);
    setLastRefreshAt(l.lastRefreshAt);
    setProviderName(l.providerName);
    setNotifications(n.notifications);
  }, [filters]);

  useEffect(() => {
    loadAll();
    const timer = setInterval(loadAll, 30000);
    return () => clearInterval(timer);
  }, [loadAll]);

  useEffect(() => {
    fetch('/api/footprints')
      .then((r) => r.json())
      .then((d) => setFootprints(d.footprints))
      .catch(() => {});
  }, []);

  // Load untracked OSM buildings for the viewport once zoomed in enough.
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleViewportChange = useCallback((bbox: string, zoom: number) => {
    setMapZoom(zoom);
    if (viewportTimer.current) clearTimeout(viewportTimer.current);
    viewportTimer.current = setTimeout(async () => {
      if (zoom < OSM_MIN_ZOOM) {
        setOsmBuildings([]);
        return;
      }
      try {
        const res = await fetch(`/api/osm-buildings?bbox=${bbox}`);
        if (res.ok) setOsmBuildings((await res.json()).buildings ?? []);
      } catch {
        /* viewport fetch is best-effort */
      }
    }, 400);
  }, []);

  const selectBuilding = useCallback((id: string) => {
    setSelectedOsm(null);
    setSelectedBuildingId(id);
  }, []);

  const selectOsm = useCallback((b: OsmBuilding) => {
    setSelectedBuildingId(null);
    setSelectedOsm(b);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedBuildingId(null);
    setSelectedOsm(null);
  }, []);

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

  const watchOsm = useCallback(
    async (b: OsmBuilding) => {
      await fetch('/api/watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buildingId: b.id,
          watch: true,
          building: {
            id: b.id,
            name: b.name,
            address: b.address,
            city: b.city,
            lat: b.lat,
            lng: b.lng,
            footprint: b.ring,
          },
        }),
      });
      await loadAll();
      setSelectedOsm(null);
      setSelectedBuildingId(b.id);
    },
    [loadAll]
  );

  const toggleListingWatch = useCallback(
    async (listingId: string, watch: boolean) => {
      await fetch('/api/watch-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, watch }),
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

  const renderListingCard = (l: ListingWithBuilding) => (
    <div
      key={l.id}
      className="card"
      role="button"
      tabIndex={0}
      onClick={() => selectBuilding(l.buildingId)}
      onKeyDown={(e) => e.key === 'Enter' && selectBuilding(l.buildingId)}
    >
      <div className="card-top">
        <span className="price">{formatPrice(l.price, l.type)}</span>
        <span className={`tag ${l.type}`}>{l.type === 'sale' ? 'Sale' : 'Rent'}</span>
        {isNew(l.firstSeenAt) && <span className="tag new">NEW</span>}
        {l.prevPrice != null && l.prevPrice > l.price && (
          <span className="tag drop">▼ was {formatPrice(l.prevPrice, l.type)}</span>
        )}
        <button
          className={`star${l.watched ? ' on' : ''}`}
          title={l.watched ? 'Stop tracking price' : 'Track price — get alerted on drops'}
          onClick={(e) => {
            e.stopPropagation();
            toggleListingWatch(l.id, !l.watched);
          }}
        >
          {l.watched ? '★' : '☆'}
        </button>
      </div>
      <div className="card-title">
        {l.buildingName} · Unit {l.unit}
      </div>
      <div className="card-sub">
        {l.beds === 0 ? 'Studio' : `${l.beds} bd`} · {l.baths} ba · {l.sqft} sqft
        · {l.city} · MLS {l.mlsNumber}
      </div>
    </div>
  );

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">◈</span>
          <div>
            <h1>Ontario Listings Tracker</h1>
            <span className="brand-sub">
              {lastRefreshAt ? `Data refreshed ${timeAgo(lastRefreshAt)}` : 'Loading…'} · auto-refreshes every 30 min ·{' '}
              <span className={`source-badge${providerName === 'crea-ddf' ? ' live' : ''}`}>
                {providerName === 'crea-ddf' ? 'LIVE MLS DATA (CREA DDF)' : 'SIMULATED DATA'}
              </span>
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
              Watchlist ({watchedBuildings.length + watchedListings.length})
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
                <button className="clear-filter" onClick={clearSelection}>
                  ✕ Showing one building — clear
                </button>
              )}
              <div className="list">
                {visibleListings.length === 0 && (
                  <p className="empty">No active listings match these filters.</p>
                )}
                {visibleListings.map(renderListingCard)}
              </div>
            </>
          )}

          {tab === 'watchlist' && (
            <div className="list">
              <div className="section-label">Watched buildings ({watchedBuildings.length})</div>
              {watchedBuildings.length === 0 && (
                <p className="empty">
                  Click any building on the map — even ones without listings — and hit
                  &ldquo;Watch&rdquo; to get alerts when new listings appear there. Zoom into a
                  city to see every selectable building.
                </p>
              )}
              {watchedBuildings.map((b) => (
                <div key={b.id} className="card static">
                  <div className="card-title">★ {b.name}</div>
                  <div className="card-sub">
                    {b.address && `${b.address}, `}{b.city} · {b.saleCount} for sale · {b.rentCount} for rent
                  </div>
                  <div className="card-actions">
                    <button className="mini" onClick={() => selectBuilding(b.id)}>
                      View on map
                    </button>
                    <button className="mini danger" onClick={() => toggleWatch(b.id, false)}>
                      Unwatch
                    </button>
                  </div>
                </div>
              ))}
              <div className="section-label">
                Price-tracked listings ({watchedListings.length})
              </div>
              {watchedListings.length === 0 && (
                <p className="empty">
                  Star ☆ a listing to track its price — you&apos;ll get an alert when it drops.
                </p>
              )}
              {watchedListings.map(renderListingCard)}
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
                  No alerts yet. Watch a building to hear about new listings, or star a
                  listing to hear about price drops.
                </p>
              )}
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`card notif${n.read ? '' : ' unread'}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectBuilding(n.buildingId)}
                  onKeyDown={(e) => e.key === 'Enter' && selectBuilding(n.buildingId)}
                >
                  <div className="card-top">
                    <span className={`tag ${n.kind === 'drop' ? 'drop' : 'new'}`}>
                      {n.kind === 'drop' ? '▼ Price drop' : 'New listing'}
                    </span>
                    <span className="card-sub">{timeAgo(n.createdAt)}</span>
                  </div>
                  <div className="notif-msg">{n.message}</div>
                </div>
              ))}
            </div>
          )}
        </aside>

        <section className="map-pane">
          <MapView
            buildings={buildings}
            footprints={footprints}
            osmBuildings={osmBuildings}
            selectedBuildingId={selectedBuildingId}
            selectedOsmId={selectedOsm?.id ?? null}
            onSelectBuilding={selectBuilding}
            onSelectOsm={selectOsm}
            onViewportChange={handleViewportChange}
          />
          {mapZoom < OSM_MIN_ZOOM && (
            <div className="map-hint">Zoom into a city to select any condo building</div>
          )}
          {(selectedBuilding || selectedOsm) && (
            <div className="building-card">
              <button className="building-card-close" onClick={clearSelection} title="Close">
                ✕
              </button>
              {selectedBuilding ? (
                <>
                  <strong>{selectedBuilding.name}</strong>
                  <div className="building-card-sub">
                    {selectedBuilding.address && `${selectedBuilding.address}, `}
                    {selectedBuilding.city}
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
                </>
              ) : (
                selectedOsm && (
                  <>
                    <strong>{selectedOsm.name}</strong>
                    <div className="building-card-sub">
                      {selectedOsm.address && `${selectedOsm.address}, `}
                      {selectedOsm.city}
                    </div>
                    <div className="building-card-sub">
                      Not tracked yet — watch it to get alerts when listings appear.
                    </div>
                    <button className="watch-btn" onClick={() => watchOsm(selectedOsm)}>
                      ☆ Watch this building
                    </button>
                  </>
                )
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
