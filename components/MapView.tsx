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
import type { BuildingWithStats } from '@/lib/types';
import type { Ring } from '@/lib/footprints';

interface MapViewProps {
  buildings: BuildingWithStats[];
  footprints: Record<string, Ring>;
  selectedBuildingId: string | null;
  onSelectBuilding: (id: string) => void;
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

function footprintStyle(watched: boolean, selected: boolean): L.PathOptions {
  const color = watched ? WATCHED_COLOR : BASE_COLOR;
  return {
    color,
    weight: selected ? 3 : 1.5,
    fillColor: color,
    fillOpacity: selected ? 0.45 : 0.2,
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

export default function MapView({
  buildings,
  footprints,
  selectedBuildingId,
  onSelectBuilding,
}: MapViewProps) {
  const selected = buildings.find((b) => b.id === selectedBuildingId);

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
      {buildings.map((b) => {
        const ring = footprints[b.id];
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
