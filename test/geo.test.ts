import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { featureContains, mentionsCountry, type CountryFeature } from "../src/logic/geo"

const features = JSON.parse(readFileSync("public/countries.geojson", "utf8")).features as CountryFeature[]

function country(name: string): CountryFeature {
  const feature = features.find((item) => item.properties.name === name)
  if (!feature) throw new Error(`missing ${name}`)
  return feature
}

describe("country polygons", () => {
  it("contains the interiors used by the click test", () => {
    expect(featureContains(country("United States"), -99.06, 39.502)).toBe(true)
    expect(featureContains(country("Nigeria"), 7.995, 9.548)).toBe(true)
    expect(featureContains(country("Japan"), 136.882, 36.019)).toBe(true)
    expect(featureContains(country("Australia"), 134.376, -25.561)).toBe(true)
  })

  it("does not treat Latin America as the United States", () => {
    const text = "Talks across Latin America stalled"
    expect(mentionsCountry(text, country("United States"))).toBe(false)
    expect(mentionsCountry("Aid arrives in the United States", country("United States"))).toBe(true)
  })
})
