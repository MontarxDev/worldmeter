export type AlertTier = "FLASH" | "PRIORITY" | "ROUTINE"

export type PagerLevel = "green" | "yellow" | "orange" | "red" | null

export type QuakeAssessment = {
  tier: AlertTier | null
  reason: string
}

/**
 * Magnitude alone never decides FLASH. USGS PAGER alert level and the tsunami
 * flag do. A green PAGER with M6+ is routine, not a flash.
 */
export function quakeTier(mag: number, pager: PagerLevel, tsunami: boolean): QuakeAssessment {
  const level = pager
  if (!Number.isFinite(mag)) return { tier: null, reason: "Magnitude missing" }

  if (level === "red" || (level === "orange" && mag >= 6.5) || (tsunami && mag >= 7)) {
    const why = level === "red"
      ? "USGS PAGER is red"
      : level === "orange"
        ? "USGS PAGER is orange and magnitude is 6.5 or higher"
        : "USGS tsunami flag is set and magnitude is 7 or higher"
    return { tier: "FLASH", reason: why }
  }

  if (level === "orange" || level === "yellow" || (tsunami && mag >= 6)) {
    const why = tsunami && level !== "orange" && level !== "yellow"
      ? "USGS tsunami flag is set"
      : `USGS PAGER is ${level}`
    return { tier: "PRIORITY", reason: why }
  }

  if (level === "green") {
    if (mag >= 6) {
      return {
        tier: "ROUTINE",
        reason: "Magnitude is 6 or higher but USGS PAGER is green, so this is not a flash",
      }
    }
    return { tier: null, reason: "USGS PAGER is green" }
  }

  if (mag >= 7.5) {
    return { tier: "PRIORITY", reason: "Magnitude is 7.5 or higher and USGS PAGER has not published a color" }
  }
  if (mag >= 6) {
    return { tier: "ROUTINE", reason: "Magnitude is 6 or higher and USGS PAGER has not published a color" }
  }
  return { tier: null, reason: "Below alert thresholds" }
}

export type RadiationNetwork = "safecast" | "epa"

export type RadiationSample = {
  id: string
  network: RadiationNetwork
  label: string
  lat: number | null
  lon: number | null
  /** Latest reading in `unit`. */
  value: number
  /** Site baseline in the same unit (median or published normal). */
  baseline: number
  unit: "cpm" | "usv" | "other"
  /** True when an EPA analyte is above the published elevated threshold. */
  epaElevated: boolean
  observedAtMs: number | null
  nowMs: number
}

const FRESH_MS = 48 * 60 * 60 * 1000
const AGREE_KM = 800

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const r = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)))
}

function fresh(sample: RadiationSample): boolean {
  if (sample.observedAtMs == null) return false
  return sample.nowMs - sample.observedAtMs <= FRESH_MS && sample.observedAtMs <= sample.nowMs + 5 * 60 * 1000
}

/** A real jump is a multiple of baseline and a meaningful absolute rise, in a known unit. */
export function isRadiationJump(sample: RadiationSample): boolean {
  if (!fresh(sample)) return false
  if (!(sample.baseline > 0) || !(sample.value > 0)) return false
  const ratio = sample.value / sample.baseline
  if (ratio < 3) return false
  if (sample.unit === "cpm") return sample.value - sample.baseline >= 40
  if (sample.unit === "usv") return sample.value - sample.baseline >= 0.15
  return false
}

export type RadiationAssessment = {
  tier: AlertTier | null
  reason: string
}

/**
 * FLASH and PRIORITY both require a real jump over baseline and a second
 * network (Safecast and EPA RadNet) within 800 km. One sensor is routine at most.
 */
export function radiationTier(sample: RadiationSample, others: readonly RadiationSample[]): RadiationAssessment {
  const jump = sample.network === "safecast" ? isRadiationJump(sample) : sample.epaElevated && fresh(sample)
  if (!jump) {
    return { tier: null, reason: "No fresh jump over baseline" }
  }

  const partner = others.find((other) => {
    if (other.id === sample.id || other.network === sample.network) return false
    const otherAgrees = other.network === "epa" ? other.epaElevated && fresh(other) : isRadiationJump(other)
    if (!otherAgrees) return false
    if (
      sample.lat == null ||
      sample.lon == null ||
      other.lat == null ||
      other.lon == null
    ) {
      return false
    }
    return haversineKm(sample.lat, sample.lon, other.lat, other.lon) <= AGREE_KM
  })

  if (!partner) {
    return {
      tier: "ROUTINE",
      reason: "One network moved and no nearby second network agreed",
    }
  }

  const ratio = sample.baseline > 0 ? sample.value / sample.baseline : 1
  if (sample.network === "safecast" && ratio >= 8 && partner.network === "epa" && partner.epaElevated) {
    return {
      tier: "FLASH",
      reason: `${sample.label} jumped to ${ratio.toFixed(1)}× its baseline and EPA RadNet is elevated nearby`,
    }
  }
  return {
    tier: "PRIORITY",
    reason: `${sample.label} and ${partner.label} both show a fresh rise within ${AGREE_KM} km`,
  }
}
