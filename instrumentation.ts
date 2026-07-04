/**
 * Starts the background refresh loop when the Next.js server boots.
 * Interval defaults to 1 hour; override with REFRESH_INTERVAL_MS.
 *
 * The NEXT_RUNTIME check is a compile-time constant: it keeps the Node-only
 * refresh code (fs, node:sqlite) out of the edge-runtime bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const g = globalThis as unknown as {
      __refreshTimer?: ReturnType<typeof setInterval>;
    };
    if (g.__refreshTimer) return;

    const { runRefresh } = await import('./lib/refresh');
    const intervalMs = Number(process.env.REFRESH_INTERVAL_MS ?? 60 * 60 * 1000);
    const tick = async () => {
      try {
        await runRefresh();
      } catch (err) {
        console.error('[refresh] failed:', err);
      }
    };
    await tick();
    g.__refreshTimer = setInterval(tick, intervalMs);
    console.log(`[refresh] scheduled every ${Math.round(intervalMs / 1000)}s`);
  }
}
