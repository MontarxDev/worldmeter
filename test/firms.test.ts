import { describe, expect, it } from "vitest"
import { FIRMS_BOXES, FIRMS_SOURCES, chooseFirmsSource, firmsBoxInRange, firmsSatelliteLabel, parseFirmsPoints } from "../src/logic/firms"

describe("FIRMS area boxes", () => {
  it("orders every box as west, south, east, north within range", () => {
    expect(FIRMS_BOXES.length).toBeGreaterThan(0)
    for (const box of FIRMS_BOXES) {
      expect(firmsBoxInRange(box), box).toBe(true)
    }
    expect(firmsBoxInRange("33,-119,35,-117")).toBe(false)
  })
})

describe("FIRMS satellite fallback", () => {
  it("tries NOAA-20, then NOAA-21, then MODIS", () => {
    expect(FIRMS_SOURCES).toEqual(["VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "MODIS_NRT"])
  })

  it("keeps NOAA-20 when it has rows", () => {
    expect(chooseFirmsSource([
      { source: "VIIRS_NOAA20_NRT", ok: true, rows: 2834 },
      { source: "VIIRS_NOAA21_NRT", ok: true, rows: 2615 },
    ])).toBe("VIIRS_NOAA20_NRT")
  })

  it("falls through a zero-row or failed feed", () => {
    expect(chooseFirmsSource([
      { source: "VIIRS_NOAA20_NRT", ok: true, rows: 0 },
      { source: "VIIRS_NOAA21_NRT", ok: true, rows: 19 },
    ])).toBe("VIIRS_NOAA21_NRT")
    expect(chooseFirmsSource([
      { source: "VIIRS_NOAA20_NRT", ok: false, rows: 0 },
      { source: "VIIRS_NOAA21_NRT", ok: false, rows: 0 },
      { source: "MODIS_NRT", ok: true, rows: 4 },
    ])).toBe("MODIS_NRT")
  })

  it("returns nothing when every feed is empty or failed", () => {
    expect(chooseFirmsSource([
      { source: "VIIRS_NOAA20_NRT", ok: true, rows: 0 },
      { source: "VIIRS_NOAA21_NRT", ok: false, rows: 0 },
      { source: "MODIS_NRT", ok: true, rows: 0 },
    ])).toBeNull()
  })

  it("labels the satellite that supplied the rows", () => {
    expect(firmsSatelliteLabel("VIIRS_NOAA20_NRT")).toBe("NOAA-20")
    expect(firmsSatelliteLabel("VIIRS_NOAA21_NRT")).toBe("NOAA-21")
    expect(firmsSatelliteLabel("MODIS_NRT")).toBe("MODIS")
  })

  it("counts coordinate rows and treats a header-only file as empty", () => {
    expect(parseFirmsPoints("latitude,longitude\n")).toEqual([])
    expect(parseFirmsPoints("latitude,longitude\n6.5,3.4\n6.6,3.5\n")).toEqual([
      { lat: 6.5, lon: 3.4 },
      { lat: 6.6, lon: 3.5 },
    ])
    expect(parseFirmsPoints("Invalid area")).toEqual([])
  })
})
