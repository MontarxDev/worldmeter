/** How often the Worker cron rebuilds the snapshot. Keep wrangler.jsonc in sync. */
/**
 * Thirty minutes keeps KV far under the free plan: one snapshot write per sweep
 * is 48 writes a day against the 1,000 daily limit (two minutes was 720).
 */
export const SWEEP_MINUTES = 30

export const SWEEP_INTERVAL_MS = SWEEP_MINUTES * 60 * 1000
