/** How often the Worker cron rebuilds the snapshot. Keep wrangler.jsonc in sync. */
export const SWEEP_MINUTES = 2

export const SWEEP_INTERVAL_MS = SWEEP_MINUTES * 60 * 1000
