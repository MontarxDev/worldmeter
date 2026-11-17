import { readFileSync, writeFileSync } from "node:fs"
import { feature } from "topojson-client"

const DISPLAY = {
  "United States of America": "United States",
  "Dem. Rep. Congo": "Democratic Republic of the Congo",
  "Dominican Rep.": "Dominican Republic",
  "Central African Rep.": "Central African Republic",
  "S. Sudan": "South Sudan",
  "Eq. Guinea": "Equatorial Guinea",
  "Bosnia and Herz.": "Bosnia and Herzegovina",
  "Solomon Is.": "Solomon Islands",
  "N. Cyprus": "Northern Cyprus",
  "W. Sahara": "Western Sahara",
  "Falkland Is.": "Falkland Islands",
  "Fr. S. Antarctic Lands": "French Southern Lands",
}

const ALIASES = {
  "United States": ["United States", "United States of America", "US", "U.S.", "USA", "America"],
  "United Kingdom": ["United Kingdom", "UK", "Britain", "Great Britain"],
  "Russia": ["Russia", "Russian Federation"],
  "South Korea": ["South Korea", "Republic of Korea"],
  "North Korea": ["North Korea", "DPRK"],
  "Czechia": ["Czechia", "Czech Republic"],
}

const topology = JSON.parse(readFileSync("node_modules/world-atlas/countries-110m.json", "utf8"))
const collection = feature(topology, topology.objects.countries)

function ringArea(ring) {
  let area = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
  }
  return Math.abs(area)
}

function ringContains(ring, lon, lat) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const intersect = (yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function contains(geometry, lon, lat) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates
  return polygons.some((polygon) => ringContains(polygon[0], lon, lat) && !polygon.slice(1).some((hole) => ringContains(hole, lon, lat)))
}

function interior(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates
  let ring = polygons[0][0]
  let best = -1
  for (const polygon of polygons) {
    const area = ringArea(polygon[0])
    if (area > best) {
      best = area
      ring = polygon[0]
    }
  }
  let area = 0
  let sx = 0
  let sy = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
    area += cross
    sx += (ring[j][0] + ring[i][0]) * cross
    sy += (ring[j][1] + ring[i][1]) * cross
  }
  area *= 0.5
  if (area !== 0) {
    const lon = sx / (6 * area)
    const lat = sy / (6 * area)
    if (contains(geometry, lon, lat)) return [round(lon), round(lat)]
  }
  let minX = 180
  let maxX = -180
  let minY = 90
  let maxY = -90
  for (const [x, y] of ring) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  for (let step = 6; step <= 30; step += 4) {
    for (let iy = 1; iy < step; iy++) {
      for (let ix = 1; ix < step; ix++) {
        const lon = minX + ((maxX - minX) * ix) / step
        const lat = minY + ((maxY - minY) * iy) / step
        if (contains(geometry, lon, lat)) return [round(lon), round(lat)]
      }
    }
  }
  return [round(ring[0][0]), round(ring[0][1])]
}

function round(value) {
  return Math.round(value * 1000) / 1000
}

function needsCut(ring) {
  for (let i = 1; i < ring.length; i++) {
    if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) return true
  }
  return false
}

function unwrap(ring) {
  const line = [[ring[0][0], ring[0][1]]]
  for (let i = 1; i < ring.length; i++) {
    let lon = ring[i][0]
    const prev = line[i - 1][0]
    while (lon - prev > 180) lon -= 360
    while (prev - lon > 180) lon += 360
    line.push([lon, ring[i][1]])
  }
  return line
}

function boundariesBetween(from, to) {
  const lo = Math.min(from, to)
  const hi = Math.max(from, to)
  const found = []
  for (let k = Math.ceil((lo - 180) / 360); k <= Math.floor((hi - 180) / 360); k++) {
    const edge = 180 + 360 * k
    if (edge > lo && edge < hi) found.push(edge)
  }
  return from < to ? found : found.reverse()
}

function cutRing(ring) {
  const line = unwrap(ring)
  const pieces = []
  let current = [[normLon(line[0][0]), line[0][1]]]
  for (let i = 1; i < line.length; i++) {
    const [lon, lat] = line[i]
    const [prevLon, prevLat] = line[i - 1]
    let cursorLon = prevLon
    let cursorLat = prevLat
    for (const edge of boundariesBetween(prevLon, lon)) {
      const t = (edge - cursorLon) / (lon - cursorLon)
      const cutLat = cursorLat + (lat - cursorLat) * t
      const direction = Math.sign(lon - prevLon)
      current.push([direction > 0 ? 179.999 : -179.999, round(cutLat)])
      if (current.length > 3) pieces.push(closeRing(current))
      current = [[direction > 0 ? -179.999 : 179.999, round(cutLat)]]
      cursorLon = edge
      cursorLat = cutLat
    }
    current.push([normLon(lon), lat])
  }
  if (current.length > 3) pieces.push(closeRing(current))
  return pieces
}

function normLon(lon) {
  let value = lon
  while (value > 180) value -= 360
  while (value < -180) value += 360
  return round(value)
}

function closeRing(ring) {
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) return [...ring, [first[0], first[1]]]
  return ring
}

function cutGeometry(geometry) {
  const source = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates
  const polygons = []
  for (const polygon of source) {
    const outer = needsCut(polygon[0]) ? cutRing(polygon[0]) : [polygon[0]]
    for (const ring of outer.flatMap(splitLongEdges)) polygons.push([ring])
  }
  if (polygons.length === 0) return geometry
  return polygons.length === 1 && geometry.type === "Polygon"
    ? { type: "Polygon", coordinates: polygons[0] }
    : { type: "MultiPolygon", coordinates: polygons }
}

function splitLongEdges(ring) {
  const open = samePoint(ring[0], ring[ring.length - 1]) ? ring.slice(0, -1) : [...ring]
  const parts = [[open[0]]]
  for (let index = 1; index < open.length; index++) {
    if (Math.abs(open[index][0] - open[index - 1][0]) > 180) parts.push([])
    parts[parts.length - 1].push(open[index])
  }
  return parts
    .filter((part) => part.length > 3)
    .map(closeRing)
    .filter((part) => Math.abs(part[0][0] - part[part.length - 2][0]) <= 180)
}

function samePoint(a, b) {
  return a[0] === b[0] && a[1] === b[1]
}

function ringsOf(geometry) {
  return geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat()
}

const features = collection.features.map((item) => {
  const raw = item.properties.name
  const name = DISPLAY[raw] ?? raw
  const [lon, lat] = interior(item.geometry)
  return {
    type: "Feature",
    properties: {
      name,
      lat,
      lon,
      aliases: ALIASES[name] ?? [name],
    },
    geometry: cutGeometry(item.geometry),
  }
})

for (const name of ["United States", "Nigeria", "Japan", "Australia"]) {
  const item = features.find((feature) => feature.properties.name === name)
  if (!item) throw new Error(`missing ${name}`)
  const ok = contains(item.geometry, item.properties.lon, item.properties.lat)
  if (!ok) throw new Error(`${name} interior is outside the polygon`)
  console.log(name, item.properties.lon, item.properties.lat)
}

const geojson = { type: "FeatureCollection", features }
writeFileSync("public/countries.geojson", JSON.stringify(geojson))
console.log("features", features.length, "bytes", Buffer.byteLength(JSON.stringify(geojson)))
