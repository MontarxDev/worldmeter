/**
 * Screen mapping for the cobe globe.
 * Marker vectors follow cobe's lat/lon conversion (longitude minus 180°, then a y/z swap).
 * The click ray uses the same J(theta, phi) matrix as the fragment shader, inverted.
 * A sign flip here is what put a click in the Americas onto Africa.
 */

const GLOBE_RADIUS = 0.8

export type Vec3 = [number, number, number]

export type ScreenPoint = { x: number; y: number; visible: boolean }

export function globePoint(lat: number, lon: number): Vec3 {
  const latRad = (lat * Math.PI) / 180
  const lonRad = (lon * Math.PI) / 180 - Math.PI
  const cosLat = Math.cos(latRad)
  const geographic: Vec3 = [-cosLat * Math.cos(lonRad), Math.sin(latRad), cosLat * Math.sin(lonRad)]
  return [geographic[0], geographic[2], geographic[1]]
}

export function latLonFromGlobePoint(point: Vec3): { lat: number; lon: number } {
  const geographic: Vec3 = [point[0], point[2], point[1]]
  const lat = (Math.asin(clamp(geographic[1], -1, 1)) * 180) / Math.PI
  let lon = (Math.atan2(-geographic[2], geographic[0]) * 180) / Math.PI
  if (lon > 180) lon -= 360
  if (lon < -180) lon += 360
  return { lat, lon }
}

/** Column-major mat3 J(theta, phi) from cobe. */
export function rotation(theta: number, phi: number): number[] {
  const cosTheta = Math.cos(theta)
  const cosPhi = Math.cos(phi)
  const sinTheta = Math.sin(theta)
  const sinPhi = Math.sin(phi)
  return [
    cosPhi, 0, sinPhi,
    sinPhi * sinTheta, cosTheta, -cosPhi * sinTheta,
    -sinPhi * cosTheta, sinTheta, cosPhi * cosTheta,
  ]
}

function apply(matrix: number[], vector: Vec3): Vec3 {
  return [
    matrix[0] * vector[0] + matrix[3] * vector[1] + matrix[6] * vector[2],
    matrix[1] * vector[0] + matrix[4] * vector[1] + matrix[7] * vector[2],
    matrix[2] * vector[0] + matrix[5] * vector[1] + matrix[8] * vector[2],
  ]
}

function applyTranspose(matrix: number[], vector: Vec3): Vec3 {
  return [
    matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
    matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
    matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2],
  ]
}

export function projectMarker(
  lat: number,
  lon: number,
  phi: number,
  theta: number,
  scale: number,
  width: number,
  height: number,
): ScreenPoint {
  const view = apply(rotation(theta, phi), globePoint(lat, lon))
  if (view[2] <= 0.05) return { x: 0, y: 0, visible: false }
  const ax = view[0] * GLOBE_RADIUS * scale
  const ay = view[1] * GLOBE_RADIUS * scale
  return {
    x: ((ax + 1) / 2) * width,
    y: height - ((ay + 1) / 2) * height,
    visible: ax * ax + ay * ay <= 1,
  }
}

export function unproject(
  x: number,
  y: number,
  phi: number,
  theta: number,
  scale: number,
  width: number,
  height: number,
): { lat: number; lon: number } | null {
  if (width <= 0 || height <= 0 || scale <= 0) return null
  const ax = (2 * x / width - 1) / scale
  const ay = (2 * (height - y) / height - 1) / scale
  const radiusSquared = ax * ax + ay * ay
  if (radiusSquared > GLOBE_RADIUS * GLOBE_RADIUS) return null
  const z = Math.sqrt(GLOBE_RADIUS * GLOBE_RADIUS - radiusSquared)
  const ray: Vec3 = [ax / GLOBE_RADIUS, ay / GLOBE_RADIUS, z / GLOBE_RADIUS]
  return latLonFromGlobePoint(applyTranspose(rotation(theta, phi), ray))
}

/** Phi/theta that turns a city toward the camera, using cobe's marker vector. */
export function focusAngles(lat: number, lon: number): { phi: number; theta: number } {
  const point = globePoint(lat, lon)
  return {
    phi: Math.atan2(point[0], Math.hypot(point[1], point[2])),
    theta: Math.atan2(-point[1], point[2]),
  }
}

export function flatProject(
  lat: number,
  lon: number,
  width: number,
  height: number,
  view: { x: number; y: number; scale: number },
): { x: number; y: number } {
  const worldX = ((normalizeLon(lon) + 180) / 360) * width
  const worldY = ((90 - lat) / 180) * height
  return {
    x: (worldX - view.x) * view.scale + width / 2,
    y: (worldY - view.y) * view.scale + height / 2,
  }
}

export function flatUnproject(
  x: number,
  y: number,
  width: number,
  height: number,
  view: { x: number; y: number; scale: number },
): { lat: number; lon: number } | null {
  if (view.scale <= 0) return null
  const worldX = (x - width / 2) / view.scale + view.x
  const worldY = (y - height / 2) / view.scale + view.y
  const lon = (worldX / width) * 360 - 180
  const lat = 90 - (worldY / height) * 180
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  return { lat, lon }
}

function normalizeLon(lon: number): number {
  let value = lon
  while (value > 180) value -= 360
  while (value < -180) value += 360
  return value
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
