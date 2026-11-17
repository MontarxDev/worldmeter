import { describe, expect, it } from "vitest"
import { FIRMS_BOXES, firmsBoxInRange } from "../src/logic/firms"

describe("FIRMS area boxes", () => {
  it("orders every box as west, south, east, north within range", () => {
    expect(FIRMS_BOXES.length).toBeGreaterThan(0)
    for (const box of FIRMS_BOXES) {
      expect(firmsBoxInRange(box), box).toBe(true)
    }
    expect(firmsBoxInRange("33,-119,35,-117")).toBe(false)
  })
})
