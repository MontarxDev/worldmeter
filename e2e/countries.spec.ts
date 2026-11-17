import { expect, test, type Page } from "@playwright/test"

const COUNTRIES = [
  { name: "United States", lat: 39.502, lon: -99.06 },
  { name: "Nigeria", lat: 9.548, lon: 7.995 },
  { name: "Japan", lat: 36.019, lon: 136.882 },
  { name: "Australia", lat: -25.561, lon: 134.376 },
] as const

async function ready(page: Page) {
  await page.goto("/")
  await page.waitForFunction(() => (window.__worldmeterCountries?.length ?? 0) > 100)
}

async function clickGlobe(page: Page, name: string, lat: number, lon: number) {
  await page.getByRole("button", { name: "3D globe" }).click()
  await page.waitForFunction(() => Boolean(window.__worldmeterGlobe))
  await page.getByTestId("globe").scrollIntoViewIfNeeded()
  const point = await page.evaluate(async ({ lat, lon }) => {
    const globe = window.__worldmeterGlobe
    if (!globe) throw new Error("globe missing")
    globe.pointOfView({ lat, lng: lon, altitude: 0.55 }, 0)
    globe.controls().autoRotate = false
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const coords = globe.getScreenCoords(lat, lon)
    const canvas = document.querySelector("[data-testid=globe] canvas")
    if (!canvas) throw new Error("globe canvas missing")
    const box = canvas.getBoundingClientRect()
    return { x: box.x + coords.x, y: box.y + coords.y, coords, box: { x: box.x, y: box.y, width: box.width, height: box.height } }
  }, { lat, lon })
  await page.mouse.move(point.x, point.y)
  await page.waitForFunction(() => document.querySelector("[data-testid=globe] canvas")?.classList.contains("clickable"), null, { timeout: 5000 })
  await page.mouse.click(point.x, point.y)
  await expect(page.getByTestId("selected-country")).toHaveText(name)
  await page.getByRole("button", { name: "Clear country" }).click()
}

async function clickFlat(page: Page, name: string, lat: number, lon: number) {
  await page.getByRole("button", { name: "Flat map" }).click()
  await page.waitForFunction(() => Boolean(window.__worldmeterMap))
  await page.getByTestId("flat-map").scrollIntoViewIfNeeded()
  const point = await page.evaluate(async ({ lat, lon }) => {
    const map = window.__worldmeterMap
    if (!map) throw new Error("map missing")
    map.jumpTo({ center: [lon, lat], zoom: 4 })
    await map.whenIdle()
    const projected = map.project([lon, lat])
    const box = map.getContainer().getBoundingClientRect()
    return { x: box.x + projected.x, y: box.y + projected.y, names: map.featuresAt(projected) }
  }, { lat, lon })
  expect(point.names).toContain(name)
  await page.mouse.click(point.x, point.y)
  await expect(page.getByTestId("selected-country")).toHaveText(name)
  await page.getByRole("button", { name: "Clear country" }).click()
}

test("country clicks select the United States, Nigeria, Japan, and Australia", async ({ page }) => {
  await ready(page)
  for (const country of COUNTRIES) {
    await clickGlobe(page, country.name, country.lat, country.lon)
    await clickFlat(page, country.name, country.lat, country.lon)
  }
})
