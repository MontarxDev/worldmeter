import { describe, expect, it } from "vitest"
import { flatProject, flatUnproject, focusAngles, projectMarker, unproject } from "../src/logic/globe"

const CITIES = [
  { name: "New York", lat: 40.71, lon: -74.01 },
  { name: "Lagos", lat: 6.52, lon: 3.38 },
  { name: "Tokyo", lat: 35.68, lon: 139.69 },
  { name: "Sydney", lat: -33.87, lon: 151.21 },
  { name: "Los Angeles", lat: 34.05, lon: -118.24 },
]

describe("globe projection", () => {
  it("round-trips known cities through the camera and back", () => {
    for (const city of CITIES) {
      const focus = focusAngles(city.lat, city.lon)
      const screen = projectMarker(city.lat, city.lon, focus.phi, focus.theta, 1, 400, 400)
      expect(screen.visible, city.name).toBe(true)
      expect(Math.hypot(screen.x - 200, screen.y - 200), city.name).toBeLessThan(8)
      const back = unproject(screen.x, screen.y, focus.phi, focus.theta, 1, 400, 400)
      expect(back, city.name).not.toBeNull()
      expect(Math.abs(back!.lat - city.lat), city.name).toBeLessThan(0.75)
      expect(Math.abs(back!.lon - city.lon), city.name).toBeLessThan(0.75)

      const turned = projectMarker(city.lat, city.lon, 1.2, -0.4, 1.4, 500, 500)
      if (turned.visible) {
        const again = unproject(turned.x, turned.y, 1.2, -0.4, 1.4, 500, 500)
        expect(Math.abs(again!.lat - city.lat), city.name).toBeLessThan(0.75)
        expect(Math.abs(again!.lon - city.lon), city.name).toBeLessThan(0.75)
      }
    }
  })

  it("does not put the Americas on Africa", () => {
    const width = 800
    const height = 400
    const view = { x: width / 2, y: height / 2, scale: 1 }
    const ny = flatProject(40.71, -74.01, width, height, view)
    const lagos = flatProject(6.52, 3.38, width, height, view)
    const tokyo = flatProject(35.68, 139.69, width, height, view)
    expect(ny.x).toBeLessThan(lagos.x)
    expect(lagos.x).toBeLessThan(tokyo.x)
    const hit = flatUnproject(ny.x, ny.y, width, height, view)
    expect(hit!.lon).toBeLessThan(-60)
    expect(hit!.lat).toBeGreaterThan(30)
  })
})
