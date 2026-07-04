import type { Building, ListingType } from '../types';

export interface SourceListing {
  id: string;
  buildingId: string;
  mlsNumber: string;
  type: ListingType;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  unit: string;
}

/**
 * A listings data source. Implement this interface to plug in a real MLS
 * feed (e.g. CREA DDF or a licensed API like Repliers) — see DATA_SOURCES.md.
 *
 * `tick` is a monotonically increasing refresh counter; real providers can
 * ignore it (the mock provider uses it to evolve inventory and prices).
 *
 * `extraBuildings` are user-watched buildings that aren't part of the
 * provider's own building list (e.g. discovered on the map). Real providers
 * can ignore this too — real MLS data already covers every building — but
 * the mock provider uses it to simulate listings appearing in them.
 */
export interface ListingsProvider {
  name: string;
  fetchBuildings(): Promise<Building[]>;
  fetchActiveListings(tick: number, extraBuildings?: Building[]): Promise<SourceListing[]>;
}
