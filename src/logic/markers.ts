import { regionOf, type RegionId } from "./regions"

export type MarkerSeverity = "info" | "routine" | "priority" | "flash"

export type Marker = {
  id: string
  sourceId: string
  kind: string
  title: string
  detail: string
  lat: number
  lon: number
  region: Exclude<RegionId, "world">
  severity: MarkerSeverity
}

const SEVERITY_RANK: Record<MarkerSeverity, number> = {
  flash: 4,
  priority: 3,
  routine: 2,
  info: 1,
}

export function placeMarker(
  marker: Omit<Marker, "region">,
): Marker {
  return { ...marker, region: regionOf(marker.lat, marker.lon) }
}

/**
 * Keep every region represented. A flood of markers from one hemisphere
 * cannot erase Africa or any other region that actually returned points.
 */
export function capMarkers(markers: readonly Marker[], limit = 160): Marker[] {
  if (markers.length <= limit) return [...markers]
  const ranked = [...markers].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
  const must = ranked.filter((marker) => marker.severity === "flash" || marker.severity === "priority")
  const rest = ranked.filter((marker) => marker.severity !== "flash" && marker.severity !== "priority")
  const buckets = new Map<string, Marker[]>()
  for (const marker of rest) {
    const list = buckets.get(marker.region) ?? []
    list.push(marker)
    buckets.set(marker.region, list)
  }
  const picked = [...must]
  while (picked.length < limit) {
    let added = false
    for (const list of buckets.values()) {
      const next = list.shift()
      if (!next) continue
      picked.push(next)
      added = true
      if (picked.length >= limit) break
    }
    if (!added) break
  }
  return picked
}
