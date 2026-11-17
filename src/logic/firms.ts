/**
 * NASA FIRMS area API boxes, ordered west, south, east, north.
 * Nigeria, then southern California.
 */
export const FIRMS_BOXES = ["2,3,14,15", "-119,33,-117,35"] as const

/**
 * VIIRS SNPP near-real-time has been returning an empty file. NOAA-20 is the
 * primary. A box falls through this list when a feed errors or has zero rows.
 */
export const FIRMS_SOURCES = ["VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "MODIS_NRT"] as const

export type FirmsSource = (typeof FIRMS_SOURCES)[number]

export type FirmsAttempt = {
  source: FirmsSource
  ok: boolean
  rows: number
}

export type FirmsPoint = { lat: number; lon: number }

/** True when `box` is west,south,east,north with longitudes and latitudes in range. */
export function firmsBoxInRange(box: string): boolean {
  const parts = box.split(",").map((part) => Number(part.trim()))
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) return false
  const [west, south, east, north] = parts
  return west >= -180 && east <= 180 && west < east && south >= -90 && north <= 90 && south < north
}

/** First feed that succeeded with at least one detection. Zero rows and errors both fall through. */
export function chooseFirmsSource(attempts: readonly FirmsAttempt[]): FirmsSource | null {
  for (const source of FIRMS_SOURCES) {
    const attempt = attempts.find((item) => item.source === source)
    if (attempt?.ok && attempt.rows > 0) return source
  }
  return null
}

export function firmsSatelliteLabel(source: FirmsSource): string {
  if (source === "VIIRS_NOAA20_NRT") return "NOAA-20"
  if (source === "VIIRS_NOAA21_NRT") return "NOAA-21"
  return "MODIS"
}

/** Coordinate rows in a FIRMS area CSV. A header-only or non-CSV body counts as zero. */
export function parseFirmsPoints(csv: string): FirmsPoint[] {
  const lines = csv.trim().split(/\r?\n/).filter((line) => line.trim())
  if (lines.length === 0) return []
  const headers = lines[0].split(",").map((header) => header.trim().toLowerCase())
  const latIndex = headers.indexOf("latitude")
  const lonIndex = headers.indexOf("longitude")
  if (latIndex < 0 || lonIndex < 0) return []
  const points: FirmsPoint[] = []
  const width = Math.max(latIndex, lonIndex)
  for (const line of lines.slice(1)) {
    const cols = line.split(",")
    if (cols.length <= width) continue
    const lat = Number(cols[latIndex])
    const lon = Number(cols[lonIndex])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue
    points.push({ lat, lon })
  }
  return points
}
