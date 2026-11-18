/** How often the Worker cron rebuilds the snapshot. Keep wrangler.jsonc in sync. */
/**
 * Five minutes keeps KV under the free plan: one snapshot write per sweep is
 * 288 writes a day against the 1,000 daily limit (two minutes was 720).
 */
export const SWEEP_MINUTES = 5

export const SWEEP_INTERVAL_MS = SWEEP_MINUTES * 60 * 1000
