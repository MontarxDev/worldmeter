export type CountryFeature = {
  type: "Feature"
  properties: { name: string; lat: number; lon: number; aliases: string[] }
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] }
}

function ringContains(ring: number[][], lon: number, lat: number): boolean {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const xi = ring[index][0]
    const yi = ring[index][1]
    const xj = ring[previous][0]
    const yj = ring[previous][1]
    const crosses = (yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (crosses) inside = !inside
  }
  return inside
}

function polygonContains(polygon: number[][][], lon: number, lat: number): boolean {
  if (!ringContains(polygon[0], lon, lat)) return false
  return !polygon.slice(1).some((hole) => ringContains(hole, lon, lat))
}

export function featureContains(feature: CountryFeature, lon: number, lat: number): boolean {
  if (feature.geometry.type === "Polygon") {
    return polygonContains(feature.geometry.coordinates as number[][][], lon, lat)
  }
  return (feature.geometry.coordinates as number[][][][]).some((polygon) => polygonContains(polygon, lon, lat))
}

export function countryOf(features: readonly CountryFeature[], lon: number, lat: number): string | null {
  for (const feature of features) {
    if (featureContains(feature, lon, lat)) return feature.properties.name
  }
  return null
}

export function mentionsCountry(text: string, feature: CountryFeature): boolean {
  return feature.properties.aliases.some((alias) => {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const pattern = new RegExp(`(?:^|[^A-Za-z])${escaped}(?:[^A-Za-z]|$)`, "i")
    if (!pattern.test(text)) return false
    if (alias === "America" && /Latin\s+America|South\s+America|Central\s+America/i.test(text)) return false
    return true
  })
}
