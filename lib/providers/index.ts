import type { ListingsProvider } from './types';
import { mockProvider } from './mock';
import { ddfConfigured, ddfProvider } from './ddf';

/**
 * Live CREA DDF® MLS data when credentials are configured (.env.local, see
 * lib/providers/ddf.ts and DATA_SOURCES.md); simulated Ontario feed otherwise.
 */
export const provider: ListingsProvider = ddfConfigured ? ddfProvider : mockProvider;

const globalForProvider = globalThis as unknown as { __providerLogged?: boolean };
if (!globalForProvider.__providerLogged) {
  globalForProvider.__providerLogged = true;
  console.log(
    ddfConfigured
      ? '[provider] using live CREA DDF MLS data'
      : '[provider] no DDF credentials found — using simulated feed (set DDF_CLIENT_ID / DDF_CLIENT_SECRET in .env.local for live data)'
  );
}
