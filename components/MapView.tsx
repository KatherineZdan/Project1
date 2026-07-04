'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { BuildingWithStats } from '@/lib/types';

interface MapViewProps {
  buildings: BuildingWithStats[];
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

function FlyToSelected({ building }: { building: BuildingWithStats | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (building) {
      map.flyTo([building.lat, building.lng], Math.max(map.getZoom(), 13), {
        duration: 0.8,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building?.id]);
  return null;
}

export default function MapView({
  buildings,
  selectedBuildingId,
  onSelectBuilding,
}: MapViewProps) {
  const selected = buildings.find((b) => b.id === selectedBuildingId);

  return (
    <MapContainer
      center={[43.9, -79.6]}
      zoom={7}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FlyToSelected building={selected} />
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
