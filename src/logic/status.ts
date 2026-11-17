export type SourceState = "ok" | "empty" | "error" | "not_configured"

export type SourceStatus = {
  id: string
  label: string
  tier: string
  description: string
  status: SourceState
  /** Items parsed from this attempt. Zero when the attempt failed or was skipped. */
  itemCount: number
  /** Items from the last attempt that actually returned data. */
  lastSuccessCount: number | null
  lastSuccess: string | null
  /** When this source was last attempted. Null when it was not configured. */
  fetchedAt: string | null
  error: string | null
  detail: string | null
  /** Env vars required before this source may be fetched. */
  env: string[] | null
}

export type SourceAttempt = {
  id: string
  configured: boolean
  ok: boolean
  itemCount: number
  error?: string | null
  detail?: string | null
  fetchedAt: string | null
}

export type CatalogSource = {
  id: string
  label: string
  tier: string
  description: string
  env: string[] | null
}

/**
 * OK means this attempt fetched data. Missing keys, empty payloads, and
 * failures stay distinct, and each source keeps its own timestamps.
 */
export function resolveSourceStatus(
  source: CatalogSource,
  attempt: SourceAttempt | undefined,
  previous: Pick<SourceStatus, "lastSuccess" | "lastSuccessCount"> | undefined,
): SourceStatus {
  const base = {
    id: source.id,
    label: source.label,
    tier: source.tier,
    description: source.description,
    env: source.env,
  }
  const lastSuccess = previous?.lastSuccess ?? null
  const lastSuccessCount = previous?.lastSuccessCount ?? null

  if (source.env && source.env.length > 0 && (!attempt || !attempt.configured)) {
    return {
      ...base,
      status: "not_configured",
      itemCount: 0,
      lastSuccessCount,
      lastSuccess,
      fetchedAt: null,
      error: null,
      detail: `Set ${source.env.join(" and ")}`,
    }
  }

  if (!attempt) {
    return {
      ...base,
      status: "error",
      itemCount: 0,
      lastSuccessCount,
      lastSuccess,
      fetchedAt: null,
      error: "Sweep did not report this source",
      detail: null,
    }
  }

  if (!attempt.ok) {
    return {
      ...base,
      status: "error",
      itemCount: 0,
      lastSuccessCount,
      lastSuccess,
      fetchedAt: attempt.fetchedAt,
      error: attempt.error || "Fetch failed",
      detail: attempt.detail ?? null,
    }
  }

  if (attempt.itemCount > 0) {
    return {
      ...base,
      status: "ok",
      itemCount: attempt.itemCount,
      lastSuccessCount: attempt.itemCount,
      lastSuccess: attempt.fetchedAt,
      fetchedAt: attempt.fetchedAt,
      error: null,
      detail: attempt.detail ?? null,
    }
  }

  return {
    ...base,
    status: "empty",
    itemCount: 0,
    lastSuccessCount,
    lastSuccess,
    fetchedAt: attempt.fetchedAt,
    error: null,
    detail: attempt.detail ?? "Fetch succeeded and returned no items",
  }
}

export function mergeSourceStatuses(
  catalog: readonly CatalogSource[],
  attempts: readonly SourceAttempt[],
  previous: readonly SourceStatus[],
): SourceStatus[] {
  const byId = new Map(attempts.map((attempt) => [attempt.id, attempt]))
  const prevById = new Map(previous.map((status) => [status.id, status]))
  return catalog.map((source) => resolveSourceStatus(source, byId.get(source.id), prevById.get(source.id)))
}
