import type { PagerLevel, RadiationSample } from "./alerts"
import { CHOKEPOINTS } from "./chokepoints"
import { buildGauges } from "./gauges"
import type { MarketQuote } from "./markets"
import type { Marker } from "./markers"
import { capMarkers, placeMarker } from "./markers"
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
  lat: number | null
  lon: number | null
  /** Place named in the headline, or "reported location" when the feed included coordinates. */
  place: string | null
}

export type MacroFigure = {
  id: string
  label: string
  value: string
  asOf: string
  url: string
}

export type SweepDelta = {
  comparedTo: string | null
  markerDelta: number
  marketMoves: { label: string; from: number; to: number; pct: number }[]
  headline: string
}

export type PriorBoard = {
  generatedAt: string
  markerCount: number
  markets: { symbol: string; label: string; price: number }[]
}

export type SweepPartial = {
  attempts: SourceAttempt[]
  markers: Marker[]
  headlines: Headline[]
  markets: MarketQuote[]
  macro: MacroFigure[]
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
  macro: MacroFigure[]
  gauges: ReturnType<typeof buildGauges>
  signals: Signal[]
  delta: SweepDelta
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
    macro: [],
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
    merged.macro.push(...(part.macro ?? []))
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

export function describeSweepDelta(
  markerCount: number,
  markets: readonly MarketQuote[],
  prior: PriorBoard | null,
): SweepDelta {
  if (!prior) {
    return {
      comparedTo: null,
      markerDelta: 0,
      marketMoves: [],
      headline: "No earlier sweep is stored yet. The next pass compares prices and the marker count.",
    }
  }
  const marketMoves = markets.flatMap((quote) => {
    const before = prior.markets.find((item) => item.symbol === quote.symbol)
    if (!before || !Number.isFinite(before.price) || before.price === 0) return []
    const pct = Math.round((((quote.price - before.price) / before.price) * 100) * 100) / 100
    return [{ label: quote.label, from: before.price, to: quote.price, pct }]
  }).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 4)
  const markerDelta = markerCount - prior.markerCount
  const when = prior.generatedAt.slice(11, 16)
  const markerText = markerDelta === 0 ? "marker count held" : `markers ${markerDelta > 0 ? "+" : ""}${markerDelta}`
  const moveText = marketMoves.length
    ? marketMoves.map((move) => `${move.label} ${move.pct > 0 ? "+" : ""}${move.pct.toFixed(2)}% versus the last stored price`).join("; ")
    : "no market price to compare"
  return {
    comparedTo: prior.generatedAt,
    markerDelta,
    marketMoves,
    headline: `Since ${when} UTC: ${markerText}. ${moveText}.`,
  }
}

const CHOKEPOINT_URL = "https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints"

function newsMarkers(headlines: readonly Headline[]): Marker[] {
  const pins: Marker[] = []
  for (const item of headlines) {
    if (item.lat == null || item.lon == null || pins.length >= 24) continue
    const reported = item.place === "reported location"
    pins.push(placeMarker({
      id: `news-${pins.length}`,
      sourceId: "news",
      kind: "News",
      title: item.title,
      detail: reported
        ? "This feed included coordinates for the item."
        : `Headline mentions ${item.place}. The pin is that place, not a measured event location.`,
      lat: item.lat,
      lon: item.lon,
      severity: "info",
      url: item.url,
      observedAt: item.publishedAt,
    }))
  }
  return pins
}

function chokepointMarkers(): Marker[] {
  return CHOKEPOINTS.map((point) => placeMarker({
    id: `choke-${point.id}`,
    sourceId: "chokepoint",
    kind: "Chokepoint",
    title: point.name,
    detail: "Fixed oil-transit strait. This is a map reference, not a live vessel count.",
    lat: point.lat,
    lon: point.lon,
    severity: "info",
    url: CHOKEPOINT_URL,
  }))
}

export function assembleSnapshot(
  parts: readonly SweepPartial[],
  previous: readonly SourceStatus[],
  generatedAt: string,
  sourceRepoUrl: string,
  prior: PriorBoard | null = null,
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
  }).slice(0, 80)

  const stories = newsMarkers(headlines)
  const straits = chokepointMarkers()
  const reserved = straits.length + stories.length
  const markers = [...straits, ...stories, ...capMarkers(merged.markers, Math.max(160 - reserved, 40))]
  return {
    ready: true,
    generatedAt,
    sweepMinutes: SWEEP_MINUTES,
    sourceRepoUrl,
    sources: mergeSourceStatuses(CATALOG, merged.attempts, previous),
    markers,
    headlines,
    markets: merged.markets,
    macro: merged.macro,
    gauges,
    signals,
    delta: describeSweepDelta(markers.length, merged.markets, prior),
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
