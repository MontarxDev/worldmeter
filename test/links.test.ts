import { describe, expect, it } from "vitest"
import { adsbUrl, firmsMapUrl, gdacsEventUrl, nwsAlertUrl, resolveItemUrl, usgsEventUrl, yahooQuoteUrl } from "../src/logic/links"

describe("per-item source URLs", () => {
  it("prefers a real item URL and falls back to the source homepage", () => {
    expect(resolveItemUrl("usgs", "https://earthquake.usgs.gov/earthquakes/eventpage/us6000")).toMatch(/^https:\/\/earthquake\.usgs\.gov/)
    expect(resolveItemUrl("usgs", "")).toBe("https://earthquake.usgs.gov/earthquakes/map/")
    expect(resolveItemUrl("usgs", "javascript:alert(1)")).toBe("https://earthquake.usgs.gov/earthquakes/map/")
    expect(resolveItemUrl("missing", null)).toBe("https://news.montarx.com/")
  })

  it("builds USGS, GDACS, NWS, FIRMS, ADS-B, and Yahoo links", () => {
    expect(usgsEventUrl("ci123")).toBe("https://earthquake.usgs.gov/earthquakes/eventpage/ci123")
    expect(usgsEventUrl(null, "https://earthquake.usgs.gov/earthquakes/eventpage/ok")).toContain("/ok")
    expect(gdacsEventUrl("TC", 1001)).toContain("eventtype=TC")
    expect(gdacsEventUrl("TC", 1001)).toContain("eventid=1001")
    expect(gdacsEventUrl("", null)).toBe("https://www.gdacs.org/")
    expect(nwsAlertUrl("https://api.weather.gov/alerts/urn:oid:1")).toContain("weather.gov")
    expect(nwsAlertUrl(null)).toBe("https://www.weather.gov/")
    expect(firmsMapUrl(6.5, 3.4)).toContain("@3.40,6.50")
    expect(adsbUrl("abc123")).toContain("icao=abc123")
    expect(yahooQuoteUrl("^GSPC")).toContain("quote/%5EGSPC")
  })
})
