export type ListingType = 'sale' | 'rent';

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
}

export interface Listing {
  id: string;
  buildingId: string;
  mlsNumber: string;
  type: ListingType;
  price: number;
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
}

export interface AppNotification {
  id: number;
  buildingId: string;
  buildingName: string;
  message: string;
  createdAt: string;
  read: boolean;
}
