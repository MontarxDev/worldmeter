import Supercluster from "supercluster"
import type { Marker } from "../logic/markers"

export type ClusterItem =
  | { kind: "event"; lat: number; lng: number; marker: Marker }
  | { kind: "cluster"; lat: number; lng: number; count: number; expansionZoom: number }

type PointProps = { id: string; cluster?: false }
type ClusterProps = { cluster: true; cluster_id: number; point_count: number }

export function clusterMarkers(markers: readonly Marker[], zoom: number): ClusterItem[] {
  const index = new Supercluster<PointProps, ClusterProps>({ radius: 48, maxZoom: 6 })
  index.load(markers.map((marker) => ({
    type: "Feature" as const,
    properties: { id: marker.id },
    geometry: { type: "Point" as const, coordinates: [marker.lon, marker.lat] },
  })))
  const byId = new Map(markers.map((marker) => [marker.id, marker]))
  const items: ClusterItem[] = []
  for (const feature of index.getClusters([-180, -85, 180, 85], zoom)) {
    const [lng, lat] = feature.geometry.coordinates
    if (feature.properties.cluster) {
      items.push({
        kind: "cluster",
        lat,
        lng,
        count: feature.properties.point_count,
        expansionZoom: index.getClusterExpansionZoom(feature.properties.cluster_id),
      })
      continue
    }
    const marker = byId.get(feature.properties.id)
    if (marker) items.push({ kind: "event", lat, lng, marker })
  }
  return items
}

export function globeZoom(altitude: number): number {
  if (altitude > 2.2) return 1
  if (altitude > 1.5) return 2
  if (altitude > 0.9) return 3
  return 6
}
