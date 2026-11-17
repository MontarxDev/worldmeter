export const REGION_IDS = [
  "world",
  "americas",
  "europe",
  "middle-east",
  "africa",
  "asia-pacific",
] as const

export type RegionId = (typeof REGION_IDS)[number]

export const REGION_LABELS: Record<RegionId, string> = {
  world: "World",
  americas: "Americas",
  europe: "Europe",
  "middle-east": "Middle East",
  africa: "Africa",
  "asia-pacific": "Asia Pacific",
}

/** Globe rotation (radians) that brings a region toward the camera. */
export const REGION_PHI: Record<RegionId, number> = {
  world: 0.4,
  americas: -1.55,
  europe: 0.15,
  "middle-east": 0.72,
  africa: 0.45,
  "asia-pacific": 2.15,
}

/**
 * Classify a coordinate. Middle East is tested before Africa so the Levant
 * is not swallowed, while the Horn of Africa (Somalia, Kenya) stays in Africa.
 */
export function regionOf(lat: number, lon: number): Exclude<RegionId, "world"> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "asia-pacific"
  const x = lon > 180 ? lon - 360 : lon < -180 ? lon + 360 : lon

  if (lat >= 24 && lat <= 43 && x >= 33 && x <= 63) return "middle-east"
  if (lat >= -35 && lat <= 37.5 && x >= -20 && x <= 52) return "africa"
  if (lat >= 36 && lat <= 72 && x >= -25 && x <= 45) return "europe"
  if (lat >= -56 && lat <= 83 && x >= -170 && x <= -30) return "americas"
  return "asia-pacific"
}

export function cardId(id: string): string {
  return `card-${id}`
}
