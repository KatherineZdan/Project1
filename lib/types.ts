export type ListingType = 'sale' | 'rent';

/** Zoom level at which untracked OSM buildings load for the viewport. */
export const OSM_MIN_ZOOM = 15;

export type Ring = [number, number][]; // [lat, lng] polygon outer ring

export interface Building {
  id: string;
  name: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
}

export interface BuildingWithStats extends Building {
  saleCount: number;
  rentCount: number;
  watched: boolean;
  footprint: Ring | null;
}

/** An untracked building discovered from OSM in the current map viewport. */
export interface OsmBuilding {
  id: string;
  name: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  ring: Ring;
}

export interface Listing {
  id: string;
  buildingId: string;
  mlsNumber: string;
  type: ListingType;
  price: number;
  origPrice: number | null;
  prevPrice: number | null;
  priceChangedAt: string | null;
  beds: number;
  baths: number;
  sqft: number;
  unit: string;
  status: 'active' | 'inactive';
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ListingWithBuilding extends Listing {
  buildingName: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  watched: boolean;
}

export type NotificationKind = 'new' | 'drop';

export interface AppNotification {
  id: number;
  buildingId: string;
  buildingName: string;
  message: string;
  kind: NotificationKind;
  createdAt: string;
  read: boolean;
}
