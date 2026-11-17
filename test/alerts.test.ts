import { describe, expect, it } from "vitest"
import { quakeTier, radiationTier, type RadiationSample } from "../src/logic/alerts"

const now = Date.parse("2026-11-17T19:00:00Z")

function sample(overrides: Partial<RadiationSample> & Pick<RadiationSample, "id" | "network">): RadiationSample {
  return {
    label: overrides.label ?? overrides.id,
    lat: 51.39,
    lon: 30.1,
    value: 40,
    baseline: 30,
    unit: "cpm",
    epaElevated: false,
    observedAtMs: now - 60_000,
    nowMs: now,
    ...overrides,
  }
}

describe("earthquake alert thresholds", () => {
  it("does not flash an M6+ quake when USGS PAGER is green", () => {
    const result = quakeTier(6.4, "green", false)
    expect(result.tier).toBe("ROUTINE")
    expect(result.tier).not.toBe("FLASH")
  })

  it("flashes when PAGER is red", () => {
    expect(quakeTier(6.2, "red", false).tier).toBe("FLASH")
  })

  it("uses orange and yellow as priority unless orange is also a large quake", () => {
    expect(quakeTier(6.1, "yellow", false).tier).toBe("PRIORITY")
    expect(quakeTier(6.2, "orange", false).tier).toBe("PRIORITY")
    expect(quakeTier(6.6, "orange", false).tier).toBe("FLASH")
  })

  it("does not flash a large quake that has no PAGER color yet", () => {
    expect(quakeTier(7.2, null, false).tier).toBe("ROUTINE")
    expect(quakeTier(7.8, null, false).tier).toBe("PRIORITY")
  })

  it("treats a tsunami flag on a large quake as a flash", () => {
    expect(quakeTier(7.1, "green", true).tier).toBe("FLASH")
    expect(quakeTier(6.2, null, true).tier).toBe("PRIORITY")
  })
})

describe("radiation alert thresholds", () => {
  it("keeps a single-sensor jump at routine", () => {
    const safecast = sample({ id: "chernobyl", network: "safecast", value: 400, baseline: 40 })
    expect(radiationTier(safecast, []).tier).toBe("ROUTINE")
  })

  it("does not promote two Safecast sensors to priority", () => {
    const a = sample({ id: "a", network: "safecast", value: 400, baseline: 40, lat: 51.39, lon: 30.1 })
    const b = sample({ id: "b", network: "safecast", value: 380, baseline: 35, lat: 51.4, lon: 30.2 })
    expect(radiationTier(a, [b]).tier).toBe("ROUTINE")
  })

  it("requires EPA RadNet to agree nearby before priority or flash", () => {
    const safecast = sample({ id: "site", network: "safecast", value: 200, baseline: 40, lat: 38.9, lon: -77 })
    const epaFar = sample({
      id: "epa-far",
      network: "epa",
      unit: "other",
      value: 8,
      baseline: 1,
      epaElevated: true,
      lat: 21.3,
      lon: -157.8,
    })
    expect(radiationTier(safecast, [epaFar]).tier).toBe("ROUTINE")

    const epaNear = sample({
      id: "epa-near",
      network: "epa",
      label: "Washington, DC gross beta",
      unit: "other",
      value: 8,
      baseline: 1,
      epaElevated: true,
      lat: 38.9,
      lon: -77.0,
    })
    expect(radiationTier(safecast, [epaNear]).tier).toBe("PRIORITY")

    const extreme = sample({ id: "site", network: "safecast", value: 500, baseline: 40, lat: 38.9, lon: -77 })
    expect(radiationTier(extreme, [epaNear]).tier).toBe("FLASH")
  })

  it("ignores noise and stale samples", () => {
    const noise = sample({ id: "noise", network: "safecast", value: 45, baseline: 30 })
    expect(radiationTier(noise, []).tier).toBeNull()
    const stale = sample({
      id: "old",
      network: "safecast",
      value: 900,
      baseline: 40,
      observedAtMs: Date.parse("2023-07-18T12:00:00Z"),
    })
    expect(radiationTier(stale, []).tier).toBeNull()
  })
})
