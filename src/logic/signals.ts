import { haversineKm, quakeTier, radiationTier, type AlertTier, type PagerLevel, type RadiationSample } from "./alerts"
import type { Gauge } from "./gauges"
import type { MarketQuote } from "./markets"
import { formatChange } from "./markets"

export type Signal = {
  id: string
  title: string
  detail: string
  tier: AlertTier | "INFO"
}

export type QuakeFact = {
  id: string
  mag: number
  place: string
  pager: PagerLevel
  tsunami: boolean
  lat: number
  lon: number
}

export type GdacsFact = {
  id: string
  name: string
  eventType: string
  alert: string
  lat: number
  lon: number
}

export function buildSignals(input: {
  quakes: readonly QuakeFact[]
  gdacs: readonly GdacsFact[]
  radiation: readonly RadiationSample[]
  markets: readonly MarketQuote[]
  gauges: readonly Gauge[]
  eonetLabel: string
}): Signal[] {
  const signals: Signal[] = []

  if (input.eonetLabel) {
    signals.push({
      id: "eonet-window",
      title: input.eonetLabel,
      detail: "NASA EONET events whose geometry falls in the last 30 days. This is a recent-event count, not a count of open incidents.",
      tier: "INFO",
    })
  }

  for (const quake of input.quakes) {
    const assessment = quakeTier(quake.mag, quake.pager, quake.tsunami)
    if (!assessment.tier) continue
    const pager = quake.pager ?? "unspecified"
    signals.push({
      id: `quake-${quake.id}`,
      title: `M${quake.mag.toFixed(1)} ${quake.place}`,
      detail: `PAGER ${pager}${quake.tsunami ? ", tsunami flag set" : ""}. ${assessment.reason}.`,
      tier: assessment.tier,
    })
  }

  for (const event of input.gdacs) {
    if (event.eventType === "EQ") continue
    const alert = event.alert.toLowerCase()
    if (alert !== "red" && alert !== "orange") continue
    signals.push({
      id: `gdacs-${event.id}`,
      title: `GDACS ${event.alert}: ${event.name}`,
      detail: `${event.eventType} alert from GDACS. Earthquake alerts are left to the USGS PAGER assessment.`,
      tier: alert === "red" ? "PRIORITY" : "INFO",
    })
  }

  for (const quake of input.quakes.filter((item) => item.mag >= 6)) {
    const match = input.gdacs.find((event) => event.eventType === "EQ" && haversineKm(quake.lat, quake.lon, event.lat, event.lon) <= 500)
    if (!match) continue
    signals.push({
      id: `cross-${quake.id}`,
      title: `USGS and GDACS both have a quake near ${quake.place}`,
      detail: `${match.name} is within 500 km of the USGS epicenter. The toast level still follows USGS PAGER, not magnitude alone.`,
      tier: "INFO",
    })
  }

  for (const sample of input.radiation) {
    const assessment = radiationTier(sample, input.radiation)
    if (!assessment.tier) continue
    if (sample.network === "epa" && assessment.tier !== "ROUTINE") continue
    signals.push({
      id: `rad-${sample.id}`,
      title: `${sample.network === "epa" ? "EPA RadNet" : "Safecast"}: ${sample.label}`,
      detail: assessment.reason,
      tier: assessment.tier,
    })
  }

  for (const quote of input.markets) {
    const abs = Math.abs(quote.changePct)
    if (quote.symbol === "^VIX") {
      if (quote.price >= 30) {
        signals.push({
          id: "vix-level",
          title: `VIX at ${quote.price.toFixed(2)}`,
          detail: `Level versus a 0–40 gauge scale. Session change is ${formatChange(quote.changePct)} from the prior close of ${quote.priorClose.toFixed(2)}, not from an older chart base.`,
          tier: quote.price >= 40 ? "PRIORITY" : "INFO",
        })
      }
      continue
    }
    if (abs < 1.5) continue
    const major = quote.symbol === "^GSPC" || quote.symbol === "^IXIC"
    signals.push({
      id: `mkt-${quote.symbol}`,
      title: `${quote.label} ${formatChange(quote.changePct)} vs prior close`,
      detail: `Last ${quote.price.toFixed(2)} against prior session close ${quote.priorClose.toFixed(2)}.`,
      tier: major && abs >= 3 ? "PRIORITY" : "INFO",
    })
  }

  for (const gauge of input.gauges) {
    if (gauge.id === "gscpi" && gauge.status === "ok" && gauge.score != null && gauge.score >= 60) {
      signals.push({
        id: "gscpi-high",
        title: `GSCPI ${gauge.valueLabel}`,
        detail: "NY Fed Global Supply Chain Pressure Index is above its long-run average. This is not an oil series.",
        tier: "INFO",
      })
    }
    if (gauge.id === "yield-curve" && gauge.status === "ok") {
      const spread = gauge.inputs[0]?.value
      if (spread && spread.trim().startsWith("-")) {
        signals.push({
          id: "curve-inverted",
          title: "Treasury curve inverted",
          detail: `10-year minus 2-year is ${spread}.`,
          tier: "INFO",
        })
      }
    }
  }

  const rank: Record<Signal["tier"], number> = { FLASH: 4, PRIORITY: 3, ROUTINE: 2, INFO: 1 }
  return signals
    .sort((a, b) => rank[b.tier] - rank[a.tier])
    .slice(0, 18)
}

export function alertsFromSignals(signals: readonly Signal[]): Signal[] {
  return signals.filter((signal) => signal.tier === "FLASH" || signal.tier === "PRIORITY" || signal.tier === "ROUTINE")
}
