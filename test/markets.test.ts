import { describe, expect, it } from "vitest"
import { priorSessionCloseFromDailyBars, quoteFromChart, sessionChangePct } from "../src/logic/markets"

describe("prior session percent change", () => {
  it("uses the previous daily bar, not the stale start of a 5-day chart", () => {
    const closes = [17.49, 18.7, 19.3, 22.91, 26.1]
    const price = 26.1
    const prior = priorSessionCloseFromDailyBars(closes, price)
    expect(prior).toBe(22.91)
    const pct = sessionChangePct(price, prior!)
    expect(pct).toBeCloseTo(13.92, 1)
    const stale = sessionChangePct(price, closes[0])
    expect(stale).toBeCloseTo(49.23, 1)
    expect(Math.abs(pct! - stale!)).toBeGreaterThan(30)
  })

  it("does not turn a roughly -1.2% index day into a -2.5% day", () => {
    const price = 5800
    const priorClose = 5870.45
    const staleBase = 5948.7
    const quote = quoteFromChart({
      symbol: "^GSPC",
      label: "S&P 500",
      regularMarketPrice: price,
      closes: [staleBase, 5900, priorClose, price],
    })
    expect("error" in quote).toBe(false)
    if ("error" in quote) return
    expect(quote.priorClose).toBeCloseTo(priorClose, 2)
    expect(quote.changePct).toBeCloseTo(-1.2, 1)
    expect(quote.changePct).not.toBeCloseTo(-2.5, 1)
  })

  it("falls back to the session dollar change and still ignores chartPreviousClose", () => {
    const quote = quoteFromChart({
      symbol: "^VIX",
      label: "VIX",
      regularMarketPrice: 26.1,
      fulldayChange: 3.19,
      closes: [],
    })
    expect("error" in quote).toBe(false)
    if ("error" in quote) return
    expect(quote.priorClose).toBeCloseTo(22.91, 2)
    expect(quote.changePct).toBeCloseTo(13.92, 1)
  })

  it("treats a missing current bar as the prior close itself", () => {
    const prior = priorSessionCloseFromDailyBars([17.49, 18.7, 22.91, null], 26.1)
    expect(prior).toBe(22.91)
  })

  it("returns null instead of inventing a base from a single print", () => {
    expect(sessionChangePct(100, 0)).toBeNull()
    expect(priorSessionCloseFromDailyBars([26.1], 26.1)).toBeNull()
  })
})
