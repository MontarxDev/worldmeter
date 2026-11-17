import { describe, expect, it } from "vitest"
import { parseRadnetTail } from "../src/logic/parse"

const now = Date.parse("2026-11-17T19:50:00Z")

function row(hour: number, dose: number): string {
  return `CA: LOS ANGELES,11/17/2026 ${String(hour).padStart(2, "0")}:00:00,${dose.toFixed(2)},1,2,APPROVED`
}

describe("EPA RadNet CSV tail", () => {
  it("reads the newest dose and treats a flat station as not elevated", () => {
    const csv = ["partial row without a date", ...Array.from({ length: 6 }, (_, index) => row(12 + index, 68 + index))].join("\n")
    const reading = parseRadnetTail(csv, now)
    expect(reading).toMatchObject({
      label: "CA: LOS ANGELES",
      doseNsvPerHour: 73,
      observedAtMs: Date.parse("2026-11-17T17:00:00Z"),
      elevated: false,
    })
    expect(reading?.baselineNsvPerHour).toBeGreaterThan(60)
    expect(reading?.baselineNsvPerHour).toBeLessThan(73)
  })

  it("flags a fresh dose that is triple the recent median and at least 80 nSv/h higher", () => {
    const csv = [...Array.from({ length: 5 }, (_, index) => row(10 + index, 70)), row(16, 400)].join("\n")
    expect(parseRadnetTail(csv, now)?.elevated).toBe(true)
  })

  it("ignores a jump whose timestamp is older than 48 hours", () => {
    const csv = "CA: LOS ANGELES,11/10/2026 12:00:00,400.00,1,2,APPROVED"
    expect(parseRadnetTail(csv, now)?.elevated).toBe(false)
  })
})
