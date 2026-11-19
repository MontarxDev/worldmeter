import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { CATALOG } from "../src/logic/catalog"
import { SWEEP_MINUTES } from "../src/logic/config"
import { buildGauges } from "../src/logic/gauges"
import { capMarkers, placeMarker } from "../src/logic/markers"
import { eonetSummary, lastFredObservation, latestGscpi } from "../src/logic/parse"
import { regionOf } from "../src/logic/regions"
import { mergeSourceStatuses, type SourceAttempt, type SourceStatus } from "../src/logic/status"

describe("source status honesty", () => {
  it("marks a keyed source not configured and does not call it ok", () => {
    const [status] = mergeSourceStatuses(
      CATALOG.filter((source) => source.id === "reliefweb"),
      [],
      [],
    )
    expect(status.status).toBe("not_configured")
    expect(status.itemCount).toBe(0)
    expect(status.detail).toContain("RELIEFWEB_APPNAME")
    expect(status.fetchedAt).toBeNull()
  })

  it("is ok only after a successful fetch that returned items", () => {
    const attempt: SourceAttempt = {
      id: "usgs",
      configured: true,
      ok: true,
      itemCount: 12,
      fetchedAt: "2026-11-17T19:00:00.000Z",
      detail: "12 events",
    }
    const [status] = mergeSourceStatuses(
      CATALOG.filter((source) => source.id === "usgs"),
      [attempt],
      [],
    )
    expect(status.status).toBe("ok")
    expect(status.itemCount).toBe(12)
    expect(status.lastSuccess).toBe(attempt.fetchedAt)
  })

  it("calls an empty payload empty, and an http failure an error that keeps the previous success", () => {
    const previous: SourceStatus = {
      ...blank("bbc"),
      status: "ok",
      itemCount: 8,
      lastSuccessCount: 8,
      lastSuccess: "2026-11-17T18:00:00.000Z",
      fetchedAt: "2026-11-17T18:00:00.000Z",
    }
    const empty = mergeSourceStatuses(
      CATALOG.filter((source) => source.id === "bbc"),
      [{ id: "bbc", configured: true, ok: true, itemCount: 0, fetchedAt: "2026-11-17T19:02:00.000Z" }],
      [previous],
    )[0]
    expect(empty.status).toBe("empty")
    expect(empty.lastSuccess).toBe(previous.lastSuccess)
    expect(empty.lastSuccessCount).toBe(8)

    const failed = mergeSourceStatuses(
      CATALOG.filter((source) => source.id === "bbc"),
      [{ id: "bbc", configured: true, ok: false, itemCount: 0, error: "HTTP 503", fetchedAt: "2026-11-17T19:04:00.000Z" }],
      [previous],
    )[0]
    expect(failed.status).toBe("error")
    expect(failed.itemCount).toBe(0)
    expect(failed.lastSuccess).toBe("2026-11-17T18:00:00.000Z")
    expect(failed.fetchedAt).not.toBe(previous.fetchedAt)
  })

  it("keeps a separate clock per source", () => {
    const attempts: SourceAttempt[] = [
      { id: "bbc", configured: true, ok: true, itemCount: 4, fetchedAt: "2026-11-17T19:00:01.000Z" },
      { id: "guardian", configured: true, ok: true, itemCount: 6, fetchedAt: "2026-11-17T19:00:07.000Z" },
    ]
    const statuses = mergeSourceStatuses(
      CATALOG.filter((source) => source.id === "bbc" || source.id === "guardian"),
      attempts,
      [],
    )
    expect(statuses[0].fetchedAt).not.toBe(statuses[1].fetchedAt)
    expect(statuses.every((status) => status.status === "ok")).toBe(true)
  })

  it("does not invent ok for a source the sweep forgot", () => {
    const [status] = mergeSourceStatuses(CATALOG.filter((source) => source.id === "gdelt"), [], [])
    expect(status.status).toBe("error")
    expect(status.error).toMatch(/did not report/i)
  })

  it("names adsb.lol, lists keyed sources, and describes EONET as recent events", () => {
    expect(CATALOG.some((source) => /ADS-B Exchange/i.test(source.label))).toBe(false)
    expect(CATALOG.find((source) => source.id === "adsb-lol")?.label).toBe("adsb.lol")
    for (const id of ["opensanctions", "reliefweb", "cloudflare-radar", "acled", "fred-api", "eia", "firms", "reddit"]) {
      const source = CATALOG.find((entry) => entry.id === id)
      expect(source?.env?.length).toBeGreaterThan(0)
    }
    expect(eonetSummary(60)).toBe("60 EONET events in the last 30 days")
    expect(eonetSummary(60).toLowerCase()).not.toContain("open")
    expect(CATALOG.length).toBeGreaterThanOrEqual(27)
  })
})

describe("gauges and geography", () => {
  it("builds the five documented gauges and never the mislabeled ones", () => {
    const gauges = buildGauges({
      vix: 26.1,
      yieldSpread: { date: "2026-11-16", value: 0.29 },
      gscpi: { date: "31-Oct-2026", value: 1.26 },
      hyOas: { date: "2026-11-16", value: 3.34 },
      quakesLast24h: 18,
    })
    expect(gauges.map((gauge) => gauge.id)).toEqual(["vix", "yield-curve", "gscpi", "hy-oas", "seismic"])
    expect(gauges.map((gauge) => gauge.label).join(" ")).not.toMatch(/crude impulse|vol \+ quake/i)
    const gscpi = gauges.find((gauge) => gauge.id === "gscpi")
    expect(gscpi?.inputs[0]?.name).toBe("NY Fed GSCPI")
    expect(gscpi?.formula.toLowerCase()).toContain("supply chain")
    expect(gscpi?.formula.toLowerCase()).not.toContain("crude")
    expect(gauges.every((gauge) => gauge.status === "ok" && gauge.score != null)).toBe(true)
  })

  it("parses the tail of a FRED CSV and the latest GSCPI vintage", () => {
    const csv = "observation_date,T10Y2Y\n2026-11-13,0.27\n2026-11-16,0.29\n2026-11-17,\n"
    expect(lastFredObservation(csv)).toEqual({ date: "2026-11-16", value: 0.29 })
    const gscpi = "Date,old,new\n30-Sep-2026,0.4,0.5\n31-Oct-2026,#N/A,1.26\n"
    expect(latestGscpi(gscpi)).toEqual({ date: "31-Oct-2026", value: 1.26 })
  })

  it("keeps African coordinates in Africa and on the map", () => {
    expect(regionOf(6.45, 3.39)).toBe("africa")
    expect(regionOf(-1.29, 36.82)).toBe("africa")
    expect(regionOf(-26.2, 28.05)).toBe("africa")
    expect(regionOf(13.47, 50.74)).toBe("africa")
    expect(regionOf(25.2, 55.27)).toBe("middle-east")
    expect(regionOf(51.5, -0.12)).toBe("europe")
    expect(regionOf(40.71, -74)).toBe("americas")

    const markers = [
      ...Array.from({ length: 40 }, (_, index) =>
        placeMarker({
          id: `us-${index}`,
          sourceId: "nws",
          kind: "weather",
          title: "US alert",
          detail: "",
          lat: 40,
          lon: -100,
          severity: "info",
        }),
      ),
      placeMarker({
        id: "lagos",
        sourceId: "open-meteo",
        kind: "weather",
        title: "Lagos",
        detail: "",
        lat: 6.45,
        lon: 3.39,
        severity: "info",
      }),
      placeMarker({
        id: "nairobi",
        sourceId: "usgs",
        kind: "quake",
        title: "Near Nairobi",
        detail: "",
        lat: -1.29,
        lon: 36.82,
        severity: "info",
      }),
    ]
    const capped = capMarkers(markers, 8)
    expect(capped.some((marker) => marker.region === "africa")).toBe(true)
    expect(capped.filter((marker) => marker.region === "africa")).toHaveLength(2)
  })
})

describe("docs match the 30-minute sweep", () => {
  it("schedules the cron every 30 minutes and does not document a 15-minute sweep", () => {
    const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8")
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8")
    expect(SWEEP_MINUTES).toBe(30)
    expect(wrangler).toContain('"*/30 * * * *"')
    expect(readme).toMatch(/every 30 minutes/)
    expect(readme.toLowerCase()).not.toContain("every 15 minutes")
  })

  it("keeps the one-write-per-sweep KV load under half the free daily write limit", () => {
    const writesPerDay = (24 * 60) / SWEEP_MINUTES
    expect(writesPerDay).toBeLessThanOrEqual(500)
  })
})

function blank(id: string): SourceStatus {
  const source = CATALOG.find((entry) => entry.id === id)!
  return {
    id,
    label: source.label,
    tier: source.tier,
    description: source.description,
    status: "empty",
    itemCount: 0,
    lastSuccessCount: null,
    lastSuccess: null,
    fetchedAt: null,
    error: null,
    detail: null,
    env: source.env,
  }
}
