import type { PagerLevel, RadiationSample } from "./alerts"
import { buildGauges } from "./gauges"
import type { MarketQuote } from "./markets"
import type { Marker } from "./markers"
import { capMarkers } from "./markers"
import { eonetSummary } from "./parse"
import { buildSignals, type GdacsFact, type QuakeFact, type Signal } from "./signals"
import { CATALOG } from "./catalog"
import { SWEEP_MINUTES } from "./config"
import { mergeSourceStatuses, type SourceAttempt, type SourceStatus } from "./status"

export type Headline = {
  title: string
  source: string
  url: string
  publishedAt: string | null
}

export type SweepPartial = {
  attempts: SourceAttempt[]
  markers: Marker[]
  headlines: Headline[]
  markets: MarketQuote[]
  quakes: QuakeFact[]
  gdacs: GdacsFact[]
  radiation: RadiationSample[]
  vix: number | null
  yieldSpread: { date: string; value: number } | null
  gscpi: { date: string; value: number } | null
  hyOas: { date: string; value: number } | null
  eonetCount: number | null
  debt: { asOf: string; trillions: number } | null
  unemployment: { asOf: string; rate: number } | null
  fx: { pair: string; rate: number }[]
}

export type Snapshot = {
  ready: true
  generatedAt: string
  sweepMinutes: number
  sourceRepoUrl: string
  sources: SourceStatus[]
  markers: Marker[]
  headlines: Headline[]
  markets: MarketQuote[]
  gauges: ReturnType<typeof buildGauges>
  signals: Signal[]
  eonetLabel: string
  debt: { asOf: string; trillions: number } | null
  unemployment: { asOf: string; rate: number } | null
  fx: { pair: string; rate: number }[]
}

export function emptyPartial(): SweepPartial {
  return {
    attempts: [],
    markers: [],
    headlines: [],
    markets: [],
    quakes: [],
    gdacs: [],
    radiation: [],
    vix: null,
    yieldSpread: null,
    gscpi: null,
    hyOas: null,
    eonetCount: null,
    debt: null,
    unemployment: null,
    fx: [],
  }
}

export function mergePartials(parts: readonly SweepPartial[]): SweepPartial {
  const merged = emptyPartial()
  for (const part of parts) {
    merged.attempts.push(...part.attempts)
    merged.markers.push(...part.markers)
    merged.headlines.push(...part.headlines)
    merged.markets.push(...part.markets)
    merged.quakes.push(...part.quakes)
    merged.gdacs.push(...part.gdacs)
    merged.radiation.push(...part.radiation)
    merged.fx.push(...part.fx)
    merged.vix = part.vix ?? merged.vix
    merged.yieldSpread = part.yieldSpread ?? merged.yieldSpread
    merged.gscpi = part.gscpi ?? merged.gscpi
    merged.hyOas = part.hyOas ?? merged.hyOas
    merged.eonetCount = part.eonetCount ?? merged.eonetCount
    merged.debt = part.debt ?? merged.debt
    merged.unemployment = part.unemployment ?? merged.unemployment
  }
  return merged
}

export function assembleSnapshot(
  parts: readonly SweepPartial[],
  previous: readonly SourceStatus[],
  generatedAt: string,
  sourceRepoUrl: string,
): Snapshot {
  const merged = mergePartials(parts)
  const usgs = merged.attempts.find((attempt) => attempt.id === "usgs")
  const gauges = buildGauges({
    vix: merged.vix,
    yieldSpread: merged.yieldSpread,
    gscpi: merged.gscpi,
    hyOas: merged.hyOas,
    quakesLast24h: usgs?.ok ? usgs.itemCount : null,
  })
  const eonetLabel = merged.eonetCount != null
    ? eonetSummary(merged.eonetCount)
    : "EONET events in the last 30 days are unavailable this sweep"
  const signals = buildSignals({
    quakes: merged.quakes,
    gdacs: merged.gdacs,
    radiation: merged.radiation,
    markets: merged.markets,
    gauges,
    eonetLabel: merged.eonetCount != null ? eonetLabel : "",
  })
  const seen = new Set<string>()
  const headlines = merged.headlines.filter((item) => {
    const key = item.title.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 40)

  return {
    ready: true,
    generatedAt,
    sweepMinutes: SWEEP_MINUTES,
    sourceRepoUrl,
    sources: mergeSourceStatuses(CATALOG, merged.attempts, previous),
    markers: capMarkers(merged.markers, 160),
    headlines,
    markets: merged.markets,
    gauges,
    signals,
    eonetLabel,
    debt: merged.debt,
    unemployment: merged.unemployment,
    fx: merged.fx.slice(0, 6),
  }
}

export function isPager(value: unknown): PagerLevel {
  if (value === "green" || value === "yellow" || value === "orange" || value === "red") return value
  return null
}
