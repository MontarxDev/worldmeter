export type DailyClose = number | null | undefined

/**
 * Prior session close from daily bars (oldest → newest).
 * The last bar is the live session when it matches `price`.
 * Trailing empty bars mean the last finite bar is already the prior close.
 * `chartPreviousClose` is intentionally not an input: on a multi-day chart
 * it is the first bar in the window, not the previous session.
 */
export function priorSessionCloseFromDailyBars(
  closes: readonly DailyClose[],
  price?: number | null,
): number | null {
  const finite: number[] = []
  for (const close of closes) {
    if (typeof close === "number" && Number.isFinite(close)) finite.push(close)
  }
  if (finite.length === 0) return null
  const last = finite[finite.length - 1]
  const priceIsLive =
    typeof price === "number" &&
    Number.isFinite(price) &&
    Math.abs(last - price) / Math.abs(price || 1) <= 0.0008
  if (!priceIsLive) return last
  if (finite.length < 2) return null
  return finite[finite.length - 2]
}

/** Percent change versus a prior session close. Returns null rather than a made-up base. */
export function sessionChangePct(price: number, priorClose: number): number | null {
  if (!Number.isFinite(price) || !Number.isFinite(priorClose) || priorClose === 0) return null
  return ((price - priorClose) / priorClose) * 100
}

export type ChartQuoteInput = {
  symbol: string
  label: string
  regularMarketPrice?: number | null
  /** Session change in price units, used only when daily bars are missing. */
  fulldayChange?: number | null
  closes?: readonly DailyClose[]
}

export type MarketQuote = {
  symbol: string
  label: string
  price: number
  priorClose: number
  changePct: number
}

export function quoteFromChart(input: ChartQuoteInput): MarketQuote | { error: string } {
  const price = input.regularMarketPrice
  if (typeof price !== "number" || !Number.isFinite(price)) {
    return { error: `${input.symbol}: no last price` }
  }
  let prior = priorSessionCloseFromDailyBars(input.closes ?? [], price)
  if (prior == null && typeof input.fulldayChange === "number" && Number.isFinite(input.fulldayChange)) {
    prior = price - input.fulldayChange
  }
  if (prior == null || !Number.isFinite(prior) || prior === 0) {
    return { error: `${input.symbol}: no prior session close` }
  }
  const changePct = sessionChangePct(price, prior)
  if (changePct == null) return { error: `${input.symbol}: could not compute session change` }
  return {
    symbol: input.symbol,
    label: input.label,
    price: round2(price),
    priorClose: round2(prior),
    changePct: round2(changePct),
  }
}

export const MARKET_SYMBOLS: readonly { symbol: string; label: string }[] = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "Nasdaq" },
  { symbol: "^VIX", label: "VIX" },
  { symbol: "CL=F", label: "WTI crude" },
  { symbol: "GC=F", label: "Gold" },
  { symbol: "BTC-USD", label: "Bitcoin" },
]

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function formatChange(pct: number): string {
  const sign = pct > 0 ? "+" : ""
  return `${sign}${pct.toFixed(2)}%`
}
