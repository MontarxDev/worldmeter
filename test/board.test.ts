import { describe, expect, it } from "vitest"
import { assembleSnapshot, describeSweepDelta, emptyPartial } from "../src/logic/assemble"
import { resolveItemUrl } from "../src/logic/links"
import { placeMarker } from "../src/logic/markers"

describe("restored board pieces", () => {
  it("keeps the eight straits and compares the previous sweep", () => {
    const snapshot = assembleSnapshot(
      [emptyPartial()],
      [],
      "2026-11-17T21:00:00.000Z",
      "https://github.com/MontarxDev/worldmeter",
      {
        generatedAt: "2026-11-17T20:58:00.000Z",
        markerCount: 3,
        markets: [{ symbol: "^GSPC", label: "S&P 500", price: 100 }],
      },
    )
    const straits = snapshot.markers.filter((marker) => marker.kind === "Chokepoint")
    expect(straits).toHaveLength(8)
    expect(straits.find((marker) => marker.id === "choke-hormuz")?.lon).toBeGreaterThan(50)
    expect(straits[0]?.url).toContain("eia.gov")
    expect(snapshot.delta.markerDelta).toBe(5)
    expect(snapshot.delta.headline).toContain("20:58")
    expect(snapshot.delta.comparedTo).toBe("2026-11-17T20:58:00.000Z")
  })

  it("says when there is no earlier sweep to compare", () => {
    const delta = describeSweepDelta(0, [], null)
    expect(delta.comparedTo).toBeNull()
    expect(delta.headline).toContain("No earlier sweep")
  })

  it("gives a marker a homepage when the adapter has no item URL", () => {
    const marker = placeMarker({
      id: "safe-1",
      sourceId: "safecast",
      kind: "Radiation",
      title: "Sample",
      detail: "Reading",
      lat: 51.4,
      lon: 30.1,
      severity: "info",
    })
    expect(marker.url).toBe(resolveItemUrl("safecast", null))
    expect(marker.url.startsWith("https://")).toBe(true)
  })
})
