import type { ListingsProvider } from './types';
import { mockProvider } from './mock';

// Swap this for a real MLS provider (CREA DDF, Repliers, etc.) when you have
// licensed data access — see DATA_SOURCES.md for options and requirements.
export const provider: ListingsProvider = mockProvider;
