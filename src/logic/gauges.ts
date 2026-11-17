export type GaugeStatus = "ok" | "error" | "not_configured"

export type Gauge = {
  id: string
  label: string
  score: number | null
  valueLabel: string
  formula: string
  inputs: { name: string; value: string }[]
  status: GaugeStatus
  note: string | null
}

export type GaugeInput = {
  vix: number | null
  yieldSpread: { date: string; value: number } | null
  gscpi: { date: string; value: number } | null
  hyOas: { date: string; value: number } | null
  /** USGS M4.5+ events with origin time in the last 24 hours. Capped at the feed limit. */
  quakesLast24h: number | null
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

/**
 * Every gauge is a documented map from a named series onto 0–100.
 * Crude prices and VIX percent-change are not inputs to these scores.
 */
export function buildGauges(input: GaugeInput): Gauge[] {
  const vix = input.vix
  const yieldGauge: Gauge = input.yieldSpread
    ? {
        id: "yield-curve",
        label: "10Y–2Y Treasury",
        score: clamp(((1.25 - input.yieldSpread.value) / 2.5) * 100),
        valueLabel: `${input.yieldSpread.value.toFixed(2)} pp`,
        formula:
          "spread = latest FRED T10Y2Y (10-year Treasury yield minus 2-year, percentage points) from the public FRED graph CSV. score = clamp((1.25 − spread) / 2.5 × 100, 0, 100). A more inverted curve scores higher.",
        inputs: [
          { name: "FRED T10Y2Y", value: `${input.yieldSpread.value.toFixed(2)} on ${input.yieldSpread.date}` },
        ],
        status: "ok",
        note: null,
      }
    : missing("yield-curve", "10Y–2Y Treasury", "FRED T10Y2Y public CSV did not return a numeric observation.")

  const gscpi = input.gscpi
    ? {
        id: "gscpi",
        label: "GSCPI",
        score: clamp(((input.gscpi.value + 2) / 5) * 100),
        valueLabel: input.gscpi.value.toFixed(2),
        formula:
          "value = latest vintage of the NY Fed Global Supply Chain Pressure Index (standard deviations from its historical average). score = clamp((value + 2) / 5 × 100, 0, 100). This slot is only the supply-chain index.",
        inputs: [{ name: "NY Fed GSCPI", value: `${input.gscpi.value.toFixed(2)} (${input.gscpi.date})` }],
        status: "ok" as const,
        note: null,
      }
    : missing("gscpi", "GSCPI", "NY Fed GSCPI CSV did not return a latest vintage.")

  const hy = input.hyOas
    ? {
        id: "hy-oas",
        label: "HY OAS",
        score: clamp((input.hyOas.value / 8) * 100),
        valueLabel: `${input.hyOas.value.toFixed(2)}%`,
        formula:
          "oas = latest ICE BofA US High Yield Index Option-Adjusted Spread, FRED series BAMLH0A0HYM2, from the public FRED graph CSV (percent). score = clamp(oas / 8 × 100, 0, 100).",
        inputs: [{ name: "FRED BAMLH0A0HYM2", value: `${input.hyOas.value.toFixed(2)}% on ${input.hyOas.date}` }],
        status: "ok" as const,
        note: null,
      }
    : missing("hy-oas", "HY OAS", "FRED BAMLH0A0HYM2 public CSV did not return a numeric observation.")

  const seismic = input.quakesLast24h != null
    ? {
        id: "seismic",
        label: "USGS M4.5+ (24h)",
        score: clamp((input.quakesLast24h / 25) * 100),
        valueLabel: String(input.quakesLast24h),
        formula:
          "count = USGS earthquakes with magnitude ≥ 4.5 and origin time in the last 24 hours (feed capped at 50 events). score = clamp(count / 25 × 100, 0, 100). Volatility is not an input.",
        inputs: [{ name: "USGS 24h M4.5+ count", value: String(input.quakesLast24h) }],
        status: "ok" as const,
        note: null,
      }
    : missing("seismic", "USGS M4.5+ (24h)", "USGS earthquake feed did not return a count.")

  return [
    vix != null
      ? {
          id: "vix",
          label: "VIX",
          score: clamp((vix / 40) * 100),
          valueLabel: vix.toFixed(2),
          formula:
            "level = CBOE VIX (^VIX) last price from Yahoo Finance. score = clamp(level / 40 × 100, 0, 100). The percent change versus the prior session close is shown on the market strip and is not this score.",
          inputs: [{ name: "CBOE VIX last price", value: vix.toFixed(2) }],
          status: "ok",
          note: null,
        }
      : missing("vix", "VIX", "Yahoo Finance did not return a VIX last price."),
    yieldGauge,
    gscpi,
    hy,
    seismic,
  ]
}

function missing(id: string, label: string, note: string): Gauge {
  return {
    id,
    label,
    score: null,
    valueLabel: "—",
    formula: note,
    inputs: [],
    status: "error",
    note,
  }
}
