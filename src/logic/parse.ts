/** Pull the newest numeric observation from a FRED graph CSV without splitting the whole history up front. */
export function lastFredObservation(csv: string): { date: string; value: number } | null {
  let end = csv.length
  while (end > 0) {
    const start = csv.lastIndexOf("\n", end - 1)
    const line = csv.slice(start + 1, end).trim()
    end = start
    if (line) {
      const comma = line.indexOf(",")
      if (comma > 0) {
        const date = line.slice(0, comma).trim()
        const value = Number.parseFloat(line.slice(comma + 1))
        if (date && date !== "observation_date" && Number.isFinite(value)) return { date, value }
      }
    }
    if (start < 0) break
  }
  return null
}

/** Latest vintage on the wide NY Fed GSCPI CSV: last numeric cell of the last dated row. */
export function latestGscpi(csv: string): { date: string; value: number } | null {
  let end = csv.length
  while (end > 0) {
    const start = csv.lastIndexOf("\n", end - 1)
    const line = csv.slice(start + 1, end).trim()
    end = start
    if (line && !line.startsWith("Date")) {
      const cols = line.split(",")
      const date = cols[0]?.trim()
      if (date && /\d/.test(date)) {
        for (let i = cols.length - 1; i >= 1; i -= 1) {
          const value = Number.parseFloat(cols[i] ?? "")
          if (Number.isFinite(value)) return { date, value }
        }
      }
    }
    if (start < 0) break
  }
  return null
}

export type RssItem = { title: string; link: string; publishedAt: string | null; lat: number | null; lon: number | null }

export function parseRssItems(xml: string, limit = 8): RssItem[] {
  const chunks = xml.split(/<item\b/i).slice(1, limit + 1)
  const items: RssItem[] = []
  for (const chunk of chunks) {
    const title = decodeXml(firstTag(chunk, "title"))
    const link = decodeXml(firstTag(chunk, "link"))
    const publishedAt = firstTag(chunk, "pubDate") || firstTag(chunk, "dc:date") || null
    const geo = readGeo(chunk)
    if (title) items.push({ title, link, publishedAt, lat: geo?.lat ?? null, lon: geo?.lon ?? null })
  }
  return items
}

function readGeo(chunk: string): { lat: number; lon: number } | null {
  const point = chunk.match(/<georss:point[^>]*>\s*([-\d.]+)\s+([-\d.]+)\s*<\/georss:point>/i)
  if (point) {
    const lat = Number(point[1])
    const lon = Number(point[2])
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon }
  }
  const lat = chunk.match(/<geo:lat[^>]*>\s*([-\d.]+)\s*<\/geo:lat>/i)
  const lon = chunk.match(/<geo:long[^>]*>\s*([-\d.]+)\s*<\/geo:long>/i)
  if (!lat || !lon) return null
  const latValue = Number(lat[1])
  const lonValue = Number(lon[1])
  if (!Number.isFinite(latValue) || !Number.isFinite(lonValue)) return null
  return { lat: latValue, lon: lonValue }
}

function firstTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i"))
  return (match?.[1] ?? "").replace(/\s+/g, " ").trim()
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim()
}

export function parseOfacHeader(xml: string): { recordCount: number; publishDate: string } | null {
  const count = xml.match(/<Record_Count>\s*(\d+)\s*<\/Record_Count>/i)
  const date = xml.match(/<Publish_Date>\s*([^<]+?)\s*<\/Publish_Date>/i)
  if (!count) return null
  return { recordCount: Number.parseInt(count[1], 10), publishDate: date?.[1]?.trim() || "unknown" }
}

export function parseKevHead(jsonText: string): { count: number; catalogVersion: string; cves: string[] } | null {
  const count = jsonText.match(/"count"\s*:\s*(\d+)/)
  const version = jsonText.match(/"catalogVersion"\s*:\s*"([^"]+)"/)
  if (!count) return null
  const cves = [...jsonText.matchAll(/"cveID"\s*:\s*"(CVE-[^"]+)"/g)].slice(0, 6).map((match) => match[1])
  return {
    count: Number.parseInt(count[1], 10),
    catalogVersion: version?.[1] ?? "unknown",
    cves,
  }
}

export function eonetSummary(count: number): string {
  return `${count} EONET events in the last 30 days`
}

export type RadnetReading = {
  label: string
  doseNsvPerHour: number
  baselineNsvPerHour: number
  observedAtMs: number
  /** Newest dose is fresh, at least 3× the recent median, and 80 nSv/h above it. */
  elevated: boolean
}

const RADNET_FRESH_MS = 48 * 60 * 60 * 1000

/**
 * Tail of an EPA RadNet near-real-time air CSV.
 * Columns: LOCATION_NAME, SAMPLE COLLECTION TIME, DOSE EQUIVALENT RATE (nSv/h), ...
 * Collection times line up with UTC. The first line may be cut off because the
 * Worker keeps only the end of the year-long file.
 */
export function parseRadnetTail(csv: string, nowMs: number): RadnetReading | null {
  const rows: { label: string; at: number; dose: number }[] = []
  for (const raw of csv.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("LOCATION_NAME")) continue
    const parts = line.split(",")
    if (parts.length < 3) continue
    const label = parts[0]?.trim() ?? ""
    const at = parseRadnetTime(parts[1]?.trim() ?? "")
    const dose = Number.parseFloat(parts[2] ?? "")
    if (!label || at == null || !Number.isFinite(dose)) continue
    rows.push({ label, at, dose })
  }
  if (rows.length === 0) return null
  const latest = rows[rows.length - 1]
  const prior = rows.slice(0, -1).slice(-24).map((row) => row.dose)
  const baseline = median(prior.length > 0 ? prior : [latest.dose])
  if (baseline == null || !(baseline > 0)) return null
  const fresh = nowMs - latest.at <= RADNET_FRESH_MS && latest.at <= nowMs + 6 * 60 * 60 * 1000
  const elevated = fresh && latest.dose / baseline >= 3 && latest.dose - baseline >= 80
  return {
    label: latest.label,
    doseNsvPerHour: latest.dose,
    baselineNsvPerHour: baseline,
    observedAtMs: latest.at,
    elevated,
  }
}

function parseRadnetTime(value: string): number | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  return Date.UTC(
    Number(match[3]),
    Number(match[1]) - 1,
    Number(match[2]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  )
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
