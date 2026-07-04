'use client';

import { useEffect } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Polygon,
  Tooltip,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { BuildingWithStats, OsmBuilding, Ring } from '@/lib/types';

interface MapViewProps {
  buildings: BuildingWithStats[];
  footprints: Record<string, Ring>;
  osmBuildings: OsmBuilding[];
  selectedBuildingId: string | null;
  selectedOsmId: string | null;
  onSelectBuilding: (id: string) => void;
  onSelectOsm: (b: OsmBuilding) => void;
  onViewportChange: (bbox: string, zoom: number) => void;
}

// Icons are cached by content so their object identity is stable across
// renders — otherwise react-leaflet recreates the marker DOM on every poll,
// which flickers and swallows in-flight clicks.
const iconCache = new Map<string, L.DivIcon>();
function markerIcon(count: number, watched: boolean, selected: boolean): L.DivIcon {
  const key = `${count}|${watched}|${selected}`;
  let icon = iconCache.get(key);
  if (!icon) {
    icon = L.divIcon({
      className: '',
      html: `<div class="bmarker${watched ? ' watched' : ''}${
        selected ? ' selected' : ''
      }">${count}</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
    iconCache.set(key, icon);
  }
  return icon;
}

const WATCHED_COLOR = '#f59e0b';
const BASE_COLOR = '#0ea5e9';
const OSM_COLOR = '#64748b';

function footprintStyle(watched: boolean, selected: boolean): L.PathOptions {
  const color = watched ? WATCHED_COLOR : BASE_COLOR;
  return {
    color,
    weight: selected ? 3 : 1.5,
    fillColor: color,
    fillOpacity: selected ? 0.45 : 0.2,
  };
}

function osmStyle(selected: boolean): L.PathOptions {
  return {
    color: selected ? BASE_COLOR : OSM_COLOR,
    weight: selected ? 2.5 : 1,
    fillColor: selected ? BASE_COLOR : OSM_COLOR,
    fillOpacity: selected ? 0.35 : 0.12,
  };
}

function FlyToSelected({ building }: { building: BuildingWithStats | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (building) {
      // Zoom in far enough that the building footprint is visible. setView
      // instead of flyTo: flyTo's spiral math produces NaN when re-triggered
      // mid-animation, which crashes Leaflet.
      map.stop();
      const current = map.getZoom();
      const zoom = Number.isFinite(current) ? Math.max(current, 16) : 16;
      map.setView([building.lat, building.lng], zoom, { animate: true, duration: 0.8 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building?.id]);
  return null;
}

function ViewportReporter({
  onChange,
}: {
  onChange: (bbox: string, zoom: number) => void;
}) {
  const map = useMap();
  useEffect(() => {
    let last = '';
    const report = () => {
      const size = map.getSize();
      if (size.x === 0 || size.y === 0) return; // container not laid out yet
      const b = map.getBounds();
      const bbox = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
      const key = `${bbox}|${map.getZoom()}`;
      if (key === last) return;
      last = key;
      onChange(bbox, map.getZoom());
    };
    report();
    map.on('moveend zoomend', report);
    // Also poll: animation-end events don't fire in rAF-throttled
    // (backgrounded) tabs, and this catches container resizes too.
    const timer = setInterval(report, 1000);
    return () => {
      map.off('moveend zoomend', report);
      clearInterval(timer);
    };
  }, [map, onChange]);
  return null;
}

export default function MapView({
  buildings,
  footprints,
  osmBuildings,
  selectedBuildingId,
  selectedOsmId,
  onSelectBuilding,
  onSelectOsm,
  onViewportChange,
}: MapViewProps) {
  const selected = buildings.find((b) => b.id === selectedBuildingId);
  const trackedIds = new Set(buildings.map((b) => b.id));

  return (
    <MapContainer
      center={[43.9, -79.6]}
      zoom={7}
      maxZoom={19}
      fadeAnimation={false}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom
    >
      {/* CARTO Positron: streets and building shapes only — no POI clutter. */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        maxZoom={19}
      />
      <FlyToSelected building={selected} />
      <ViewportReporter onChange={onViewportChange} />

      {/* Untracked buildings in the viewport — click any of them to track. */}
      {osmBuildings.map((b) => {
        if (trackedIds.has(b.id)) return null;
        const isSelected = b.id === selectedOsmId;
        return (
          <Polygon
            key={b.id}
            positions={b.ring}
            pathOptions={osmStyle(isSelected)}
            eventHandlers={{
              click: () => onSelectOsm(b),
              mouseover: (e) =>
                (e.target as L.Polygon).setStyle({ fillOpacity: 0.4, weight: 2.5, color: BASE_COLOR }),
              mouseout: (e) => (e.target as L.Polygon).setStyle(osmStyle(isSelected)),
            }}
          >
            <Tooltip sticky>{b.name} — click to select</Tooltip>
          </Polygon>
        );
      })}

      {/* Tracked buildings. */}
      {buildings.map((b) => {
        const ring = footprints[b.id] ?? b.footprint;
        if (!ring) return null;
        const isSelected = b.id === selectedBuildingId;
        return (
          <Polygon
            key={`fp-${b.id}`}
            positions={ring}
            pathOptions={footprintStyle(b.watched, isSelected)}
            eventHandlers={{
              click: () => onSelectBuilding(b.id),
              mouseover: (e) => (e.target as L.Polygon).setStyle({ fillOpacity: 0.55, weight: 3 }),
              mouseout: (e) =>
                (e.target as L.Polygon).setStyle(footprintStyle(b.watched, isSelected)),
            }}
          >
            <Tooltip sticky>
              {b.watched ? '★ ' : ''}
              {b.name} — click to select
            </Tooltip>
          </Polygon>
        );
      })}
      {buildings.map((b) => (
        <Marker
          key={b.id}
          position={[b.lat, b.lng]}
          icon={markerIcon(b.saleCount + b.rentCount, b.watched, b.id === selectedBuildingId)}
          eventHandlers={{ click: () => onSelectBuilding(b.id) }}
        />
      ))}
    </MapContainer>
  );
}
