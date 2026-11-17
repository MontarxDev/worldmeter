/**
 * NASA FIRMS area API boxes, ordered west, south, east, north.
 * Nigeria, then southern California.
 */
export const FIRMS_BOXES = ["2,3,14,15", "-119,33,-117,35"] as const

/** True when `box` is west,south,east,north with longitudes and latitudes in range. */
export function firmsBoxInRange(box: string): boolean {
  const parts = box.split(",").map((part) => Number(part.trim()))
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) return false
  const [west, south, east, north] = parts
  return west >= -180 && east <= 180 && west < east && south >= -90 && north <= 90 && south < north
}
