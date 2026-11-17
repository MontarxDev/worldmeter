import type { RadiationSample } from "../logic/alerts"
import { emptyPartial, isPager, type SweepPartial } from "../logic/assemble"
import { MARKET_SYMBOLS, quoteFromChart } from "../logic/markets"
import { placeMarker } from "../logic/markers"
import { lastFredObservation, latestGscpi, parseKevHead, parseOfacHeader, parseRadnetTail, parseRssItems } from "../logic/parse"
import type { SourceAttempt } from "../logic/status"
import { failureMessage, fetchCapped, fetchTail, present, readJson, USER_AGENT } from "./http"

export interface WorkerEnv {
  PUBLIC_SITE_URL: string
  SOURCE_REPO_URL: string
  SNAPSHOTS: KVNamespace
  ASSETS: Fetcher
  SWEEP_SECRET?: string
  OPENSANCTIONS_API_KEY?: string
  RELIEFWEB_APPNAME?: string
  CLOUDFLARE_RADAR_TOKEN?: string
  ACLED_EMAIL?: string
  ACLED_PASSWORD?: string
  FRED_API_KEY?: string
  EIA_API_KEY?: string
  FIRMS_MAP_KEY?: string
  REDDIT_CLIENT_ID?: string
  REDDIT_CLIENT_SECRET?: string
  /** Set only in .dev.vars. Wrangler rewrites the local Host to the custom domain. */
  SWEEP_INLINE?: string
}

const DAY_MS = 24 * 60 * 60 * 1000

const METEO_CITIES = [
  { name: "Lagos", lat: 6.45, lon: 3.39 },
  { name: "Nairobi", lat: -1.29, lon: 36.82 },
  { name: "Johannesburg", lat: -26.2, lon: 28.05 },
  { name: "Cairo", lat: 30.04, lon: 31.24 },
  { name: "London", lat: 51.51, lon: -0.13 },
  { name: "New York", lat: 40.71, lon: -74.01 },
  { name: "Tokyo", lat: 35.68, lon: 139.69 },
  { name: "São Paulo", lat: -23.55, lon: -46.63 },
]

async function source(
  id: string,
  run: (partial: SweepPartial) => Promise<{ itemCount: number; detail?: string }>,
): Promise<SweepPartial> {
  const fetchedAt = new Date().toISOString()
  const partial = emptyPartial()
  try {
    const result = await run(partial)
    partial.attempts.push({
      id,
      configured: true,
      ok: true,
      itemCount: result.itemCount,
      detail: result.detail ?? null,
      fetchedAt,
    })
    return partial
  } catch (error) {
    const failed = emptyPartial()
    failed.attempts.push({
      id,
      configured: true,
      ok: false,
      itemCount: 0,
      fetchedAt,
      error: failureMessage(error),
    })
    return failed
  }
}

function join(parts: SweepPartial[]): SweepPartial {
  const merged = emptyPartial()
  for (const part of parts) {
    merged.attempts.push(...part.attempts)
    merged.markers.push(...part.markers)
    merged.headlines.push(...part.headlines)
    merged.markets.push(...part.markets)
    merged.quakes.push(...part.quakes)
    merged.gdacs.push(...part.gdacs)
    merged.radiation.push(...part.radiation)
    merged.fx.push(...part.fx)
    merged.vix = part.vix ?? merged.vix
    merged.yieldSpread = part.yieldSpread ?? merged.yieldSpread
    merged.gscpi = part.gscpi ?? merged.gscpi
    merged.hyOas = part.hyOas ?? merged.hyOas
    merged.eonetCount = part.eonetCount ?? merged.eonetCount
    merged.debt = part.debt ?? merged.debt
    merged.unemployment = part.unemployment ?? merged.unemployment
  }
  return merged
}

export async function batchGeo(): Promise<SweepPartial> {
  return join(await Promise.all([usgs(), eonet()]))
}

export async function batchHazards(): Promise<SweepPartial> {
  return join(await Promise.all([gdacs(), nws()]))
}

export async function batchNews(): Promise<SweepPartial> {
  return join(await Promise.all([
    rss("bbc", "BBC", "https://feeds.bbci.co.uk/news/world/rss.xml", 40_000),
    rss("guardian", "Guardian", "https://www.theguardian.com/world/rss", 48_000),
    rss("aljazeera", "Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml", 40_000),
    rss("who", "WHO", "https://www.who.int/rss-feeds/news-english.xml", 48_000),
  ]))
}

export async function batchGdelt(): Promise<SweepPartial> {
  return gdelt()
}

export async function batchMarkets(): Promise<SweepPartial> {
  return yahoo()
}

export async function batchRates(): Promise<SweepPartial> {
  return join(await Promise.all([frankfurter(), treasuryDebt(), bls(), fredHy()]))
}

export async function batchCurve(): Promise<SweepPartial> {
  return fredYield()
}

export async function batchSupply(): Promise<SweepPartial> {
  return join(await Promise.all([gscpi(), openMeteo()]))
}

export async function batchSpace(): Promise<SweepPartial> {
  return join(await Promise.all([celestrak(), iss(), donki()]))
}

export async function batchSafety(): Promise<SweepPartial> {
  return join(await Promise.all([ofac(), kev(), safecast(), epa()]))
}

export async function batchFlights(): Promise<SweepPartial> {
  return join(await Promise.all([adsb(), bluesky()]))
}

export async function batchKeyed(env: WorkerEnv): Promise<SweepPartial> {
  const jobs: Promise<SweepPartial>[] = []
  if (present(env.OPENSANCTIONS_API_KEY)) jobs.push(openSanctions(env.OPENSANCTIONS_API_KEY!))
  if (present(env.RELIEFWEB_APPNAME)) jobs.push(reliefWeb(env.RELIEFWEB_APPNAME!))
  if (present(env.CLOUDFLARE_RADAR_TOKEN)) jobs.push(radar(env.CLOUDFLARE_RADAR_TOKEN!))
  if (present(env.ACLED_EMAIL) && present(env.ACLED_PASSWORD)) jobs.push(acled(env.ACLED_EMAIL!, env.ACLED_PASSWORD!))
  if (present(env.FRED_API_KEY)) jobs.push(fredApi(env.FRED_API_KEY!))
  if (present(env.EIA_API_KEY)) jobs.push(eia(env.EIA_API_KEY!))
  if (present(env.FIRMS_MAP_KEY)) jobs.push(firms(env.FIRMS_MAP_KEY!))
  if (present(env.REDDIT_CLIENT_ID) && present(env.REDDIT_CLIENT_SECRET)) {
    jobs.push(reddit(env.REDDIT_CLIENT_ID!, env.REDDIT_CLIENT_SECRET!))
  }
  if (jobs.length === 0) return emptyPartial()
  return join(await Promise.all(jobs))
}

export const BATCHES: Record<string, (env: WorkerEnv) => Promise<SweepPartial>> = {
  geo: () => batchGeo(),
  hazards: () => batchHazards(),
  news: () => batchNews(),
  gdelt: () => batchGdelt(),
  markets: () => batchMarkets(),
  rates: () => batchRates(),
  curve: () => batchCurve(),
  supply: () => batchSupply(),
  space: () => batchSpace(),
  safety: () => batchSafety(),
  flights: () => batchFlights(),
  keyed: (env) => batchKeyed(env),
}

export function missingKeyAttempts(env: WorkerEnv): SourceAttempt[] {
  const flags: Record<string, boolean> = {
    opensanctions: present(env.OPENSANCTIONS_API_KEY),
    reliefweb: present(env.RELIEFWEB_APPNAME),
    "cloudflare-radar": present(env.CLOUDFLARE_RADAR_TOKEN),
    acled: present(env.ACLED_EMAIL) && present(env.ACLED_PASSWORD),
    "fred-api": present(env.FRED_API_KEY),
    eia: present(env.EIA_API_KEY),
    firms: present(env.FIRMS_MAP_KEY),
    reddit: present(env.REDDIT_CLIENT_ID) && present(env.REDDIT_CLIENT_SECRET),
  }
  return Object.entries(flags)
    .filter(([, configured]) => !configured)
    .map(([id]) => ({ id, configured: false, ok: false, itemCount: 0, fetchedAt: null }))
}

async function usgs(): Promise<SweepPartial> {
  return source("usgs", async (partial) => {
    const start = new Date(Date.now() - DAY_MS).toISOString().slice(0, 19)
    const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=4.5&starttime=${start}&orderby=time&limit=50`
    const response = await fetchCapped(url, { maxBytes: 250_000, timeoutMs: 10_000 })
    const body = readJson<{ features?: UsgsFeature[] }>(response.text, response.status)
    const features = body.features ?? []
    for (const feature of features) {
      const coords = feature.geometry?.coordinates
      if (!coords || coords.length < 2) continue
      const [lon, lat] = coords
      const mag = feature.properties?.mag ?? 0
      const pager = isPager(feature.properties?.alert)
      const tsunami = feature.properties?.tsunami === 1
      const place = feature.properties?.place || "Earthquake"
      const id = feature.properties?.code || feature.id || `${lat},${lon}`
      partial.quakes.push({ id, mag, place, pager, tsunami, lat, lon })
      partial.markers.push(placeMarker({
        id: `usgs-${id}`,
        sourceId: "usgs",
        kind: "Quake",
        title: `M${mag.toFixed(1)} ${place}`,
        detail: `PAGER ${pager ?? "not published"}${tsunami ? " · tsunami flag" : ""}`,
        lat,
        lon,
        severity: pager === "red" ? "flash" : pager === "orange" || pager === "yellow" ? "priority" : "info",
      }))
    }
    return { itemCount: features.length, detail: `${features.length} events of M4.5+ in 24 hours` }
  })
}

async function eonet(): Promise<SweepPartial> {
  return source("eonet", async (partial) => {
    const response = await fetchCapped("https://eonet.gsfc.nasa.gov/api/v3/events?days=30&limit=40", { maxBytes: 200_000 })
    const body = readJson<{ events?: EonetEvent[] }>(response.text, response.status)
    const events = body.events ?? []
    partial.eonetCount = events.length
    for (const event of events) {
      const point = [...(event.geometry ?? [])].reverse().find((geometry) => geometry.type === "Point" && geometry.coordinates)
      if (!point?.coordinates) continue
      const [lon, lat] = point.coordinates
      partial.markers.push(placeMarker({
        id: `eonet-${event.id}`,
        sourceId: "eonet",
        kind: event.categories?.[0]?.title || "EONET",
        title: event.title,
        detail: "NASA EONET event in the last 30 days",
        lat,
        lon,
        severity: "info",
      }))
    }
    return { itemCount: events.length, detail: `${events.length} events in the last 30 days` }
  })
}

async function gdacs(): Promise<SweepPartial> {
  return source("gdacs", async (partial) => {
    const response = await fetchCapped(
      "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ;TC;FL;VO;DR&limit=20",
      { maxBytes: 180_000, timeoutMs: 12_000 },
    )
    const body = readJson<{ features?: GdacsFeature[] }>(response.text, response.status)
    const features = (body.features ?? []).slice(0, 20)
    for (const feature of features) {
      const coords = feature.geometry?.coordinates
      if (!coords) continue
      const [lon, lat] = coords
      const props = feature.properties ?? {}
      const alert = String(props.alertlevel || "Green")
      partial.gdacs.push({
        id: String(props.eventid ?? `${lat},${lon}`),
        name: props.name || props.eventname || "GDACS event",
        eventType: props.eventtype || "??",
        alert,
        lat,
        lon,
      })
      partial.markers.push(placeMarker({
        id: `gdacs-${props.eventtype}-${props.eventid}`,
        sourceId: "gdacs",
        kind: "GDACS",
        title: props.name || "GDACS event",
        detail: `${props.eventtype || "event"} · ${alert}`,
        lat,
        lon,
        severity: alert.toLowerCase() === "red" ? "priority" : "info",
      }))
    }
    return { itemCount: features.length, detail: `${features.length} current GDACS events` }
  })
}

async function nws(): Promise<SweepPartial> {
  return source("nws", async (partial) => {
    const headers = { accept: "application/geo+json" }
    const [countRes, extremeRes] = await Promise.all([
      fetchCapped("https://api.weather.gov/alerts/active/count", { headers, maxBytes: 80_000 }),
      fetchCapped("https://api.weather.gov/alerts/active?status=actual&severity=Extreme", { headers, maxBytes: 120_000 }),
    ])
    const countBody = readJson<{ total?: number }>(countRes.text, countRes.status)
    const extreme = readJson<{ features?: NwsFeature[] }>(extremeRes.text, extremeRes.status)
    for (const feature of extreme.features ?? []) {
      const point = featurePoint(feature)
      if (!point) continue
      partial.markers.push(placeMarker({
        id: `nws-${feature.properties?.id || point.lat}`,
        sourceId: "nws",
        kind: "Weather",
        title: feature.properties?.event || "Extreme alert",
        detail: feature.properties?.headline || feature.properties?.areaDesc || "NWS extreme alert",
        lat: point.lat,
        lon: point.lon,
        severity: "priority",
      }))
    }
    const total = countBody.total ?? extreme.features?.length ?? 0
    return { itemCount: total, detail: `${total} active NWS alerts, ${(extreme.features ?? []).length} extreme` }
  })
}

async function rss(id: string, sourceName: string, url: string, maxBytes: number): Promise<SweepPartial> {
  return source(id, async (partial) => {
    const response = await fetchCapped(url, { maxBytes, timeoutMs: 10_000, headers: { accept: "application/rss+xml, application/xml, text/xml" } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const items = parseRssItems(response.text, 8)
    for (const item of items) {
      partial.headlines.push({
        title: item.title,
        source: sourceName,
        url: item.link || url,
        publishedAt: item.publishedAt,
      })
    }
    return { itemCount: items.length, detail: `${items.length} headlines` }
  })
}

async function gdelt(): Promise<SweepPartial> {
  return source("gdelt", async (partial) => {
    const url = "https://api.gdeltproject.org/api/v2/doc/doc?query=sourcelang:english&mode=ArtList&maxrecords=8&timespan=1d&format=json&sort=DateDesc"
    const response = await fetchCapped(url, { maxBytes: 120_000, timeoutMs: 18_000 })
    if (response.status === 429) throw new Error("GDELT rate limit: one request every 5 seconds")
    const body = readJson<{ articles?: { title?: string; url?: string; seendate?: string; domain?: string }[] }>(response.text, response.status)
    const articles = (body.articles ?? []).filter((article) => article.title)
    for (const article of articles) {
      partial.headlines.push({
        title: article.title!,
        source: article.domain || "GDELT",
        url: article.url || "https://www.gdeltproject.org/",
        publishedAt: article.seendate ?? null,
      })
    }
    return { itemCount: articles.length, detail: `${articles.length} articles in the last day` }
  })
}

async function yahoo(): Promise<SweepPartial> {
  return source("yahoo", async (partial) => {
    const quotes = await Promise.all(MARKET_SYMBOLS.map(async (item) => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(item.symbol)}?range=5d&interval=1d&includePrePost=false`
      const response = await fetchCapped(url, {
        maxBytes: 40_000,
        headers: { "user-agent": "Mozilla/5.0 (compatible; Worldmeter/1.0)" },
      })
      const body = readJson<YahooChart>(response.text, response.status)
      const result = body.chart?.result?.[0]
      const quote = quoteFromChart({
        symbol: item.symbol,
        label: item.label,
        regularMarketPrice: result?.meta?.regularMarketPrice,
        fulldayChange: result?.meta?.fulldayChange,
        closes: result?.indicators?.quote?.[0]?.close,
      })
      return quote
    }))
    const ok = quotes.filter((quote): quote is Exclude<typeof quote, { error: string }> => !("error" in quote))
    if (ok.length === 0) {
      const reason = quotes.find((quote) => "error" in quote)
      throw new Error(reason && "error" in reason ? reason.error : "No quotes")
    }
    partial.markets.push(...ok)
    const vix = ok.find((quote) => quote.symbol === "^VIX")
    if (vix) partial.vix = vix.price
    const failed = quotes.length - ok.length
    return { itemCount: ok.length, detail: failed ? `${ok.length} quotes, ${failed} missing a prior close` : `${ok.length} quotes vs prior session close` }
  })
}

async function frankfurter(): Promise<SweepPartial> {
  return source("frankfurter", async (partial) => {
    const response = await fetchCapped("https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,ZAR,NGN,BRL", { maxBytes: 20_000 })
    const body = readJson<{ date?: string; rates?: Record<string, number> }>(response.text, response.status)
    const rates = body.rates ?? {}
    partial.fx = Object.entries(rates).map(([pair, rate]) => ({ pair: `USD/${pair}`, rate }))
    return { itemCount: partial.fx.length, detail: body.date ? `ECB rates on ${body.date}` : "ECB reference rates" }
  })
}

async function treasuryDebt(): Promise<SweepPartial> {
  return source("treasury-debt", async (partial) => {
    const response = await fetchCapped(
      "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=1",
      { maxBytes: 20_000 },
    )
    const body = readJson<{ data?: { record_date?: string; tot_pub_debt_out_amt?: string }[] }>(response.text, response.status)
    const row = body.data?.[0]
    const amount = Number(row?.tot_pub_debt_out_amt)
    if (!row || !Number.isFinite(amount)) throw new Error("No debt figure")
    partial.debt = { asOf: row.record_date || "", trillions: amount / 1e12 }
    return { itemCount: 1, detail: `$${partial.debt.trillions.toFixed(2)}T on ${partial.debt.asOf}` }
  })
}

async function fredYield(): Promise<SweepPartial> {
  return source("fred-yield-csv", async (partial) => {
    const response = await fetchCapped("https://fred.stlouisfed.org/graph/fredgraph.csv?id=T10Y2Y", { maxBytes: 400_000, timeoutMs: 12_000 })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const observation = lastFredObservation(response.text)
    if (!observation) throw new Error("No T10Y2Y observation")
    partial.yieldSpread = observation
    return { itemCount: 1, detail: `${observation.value.toFixed(2)} on ${observation.date}` }
  })
}

async function fredHy(): Promise<SweepPartial> {
  return source("fred-hy-csv", async (partial) => {
    const response = await fetchCapped("https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAMLH0A0HYM2", { maxBytes: 80_000, timeoutMs: 12_000 })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const observation = lastFredObservation(response.text)
    if (!observation) throw new Error("No BAMLH0A0HYM2 observation")
    partial.hyOas = observation
    return { itemCount: 1, detail: `${observation.value.toFixed(2)}% on ${observation.date}` }
  })
}

async function gscpi(): Promise<SweepPartial> {
  return source("gscpi", async (partial) => {
    const response = await fetchCapped(
      "https://www.newyorkfed.org/medialibrary/research/interactives/data/gscpi/gscpi_interactive_data.csv",
      { maxBytes: 500_000, timeoutMs: 12_000, headers: { accept: "text/csv" } },
    )
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const latest = latestGscpi(response.text)
    if (!latest) throw new Error("No GSCPI vintage")
    partial.gscpi = latest
    return { itemCount: 1, detail: `${latest.value.toFixed(2)} (${latest.date})` }
  })
}

async function bls(): Promise<SweepPartial> {
  return source("bls", async (partial) => {
    const response = await fetchCapped("https://api.bls.gov/publicAPI/v1/timeseries/data/LNS14000000", { maxBytes: 40_000 })
    const body = readJson<{ Results?: { series?: { data?: { year?: string; periodName?: string; value?: string }[] }[] } }>(response.text, response.status)
    const row = body.Results?.series?.[0]?.data?.[0]
    const rate = Number(row?.value)
    if (!row || !Number.isFinite(rate)) throw new Error("No unemployment print")
    partial.unemployment = { asOf: `${row.periodName} ${row.year}`, rate }
    return { itemCount: 1, detail: `${rate.toFixed(1)}% in ${partial.unemployment.asOf}` }
  })
}

async function openMeteo(): Promise<SweepPartial> {
  return source("open-meteo", async (partial) => {
    const lats = METEO_CITIES.map((city) => city.lat).join(",")
    const lons = METEO_CITIES.map((city) => city.lon).join(",")
    const response = await fetchCapped(
      `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,weather_code`,
      { maxBytes: 40_000 },
    )
    const body = readJson<MeteoRow[] | MeteoRow>(response.text, response.status)
    const rows = Array.isArray(body) ? body : [body]
    rows.forEach((row, index) => {
      const city = METEO_CITIES[index]
      if (!city || row.current?.temperature_2m == null) return
      const code = row.current.weather_code ?? 0
      partial.markers.push(placeMarker({
        id: `meteo-${city.name}`,
        sourceId: "open-meteo",
        kind: "Weather",
        title: `${city.name} ${Math.round(row.current.temperature_2m)}°C`,
        detail: weatherLabel(code),
        lat: city.lat,
        lon: city.lon,
        severity: code >= 95 ? "priority" : "info",
      }))
    })
    return { itemCount: rows.length, detail: `${rows.length} city observations` }
  })
}

async function celestrak(): Promise<SweepPartial> {
  return source("celestrak", async () => {
    const response = await fetchCapped("https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json", { maxBytes: 80_000 })
    const body = readJson<{ OBJECT_NAME?: string }[]>(response.text, response.status)
    if (!Array.isArray(body) || body.length === 0) throw new Error("No station elements")
    const iss = body.find((row) => /ISS/i.test(row.OBJECT_NAME || ""))
    return { itemCount: body.length, detail: iss ? `${body.length} station objects, including ${iss.OBJECT_NAME}` : `${body.length} station objects` }
  })
}

async function iss(): Promise<SweepPartial> {
  return source("iss", async (partial) => {
    const response = await fetchCapped("https://api.wheretheiss.at/v1/satellites/25544", { maxBytes: 10_000 })
    const body = readJson<{ latitude?: number; longitude?: number; altitude?: number; velocity?: number }>(response.text, response.status)
    if (body.latitude == null || body.longitude == null) throw new Error("No ISS position")
    partial.markers.push(placeMarker({
      id: "iss",
      sourceId: "iss",
      kind: "ISS",
      title: "ISS",
      detail: `Altitude ${Math.round(body.altitude ?? 0)} km`,
      lat: body.latitude,
      lon: body.longitude,
      severity: "info",
    }))
    return { itemCount: 1, detail: `${body.latitude.toFixed(1)}°, ${body.longitude.toFixed(1)}°` }
  })
}

async function donki(): Promise<SweepPartial> {
  return source("donki", async () => {
    const end = new Date()
    const start = new Date(Date.now() - 3 * DAY_MS)
    const url = `https://api.nasa.gov/DONKI/notifications?startDate=${start.toISOString().slice(0, 10)}&endDate=${end.toISOString().slice(0, 10)}&type=all&api_key=DEMO_KEY`
    const response = await fetchCapped(url, { maxBytes: 120_000, timeoutMs: 12_000 })
    const body = readJson<{ messageType?: string }[]>(response.text, response.status)
    if (!Array.isArray(body)) throw new Error("Unexpected DONKI payload")
    return { itemCount: body.length, detail: `${body.length} notifications in the last 3 days` }
  })
}

async function ofac(): Promise<SweepPartial> {
  return source("ofac", async () => {
    const response = await fetchCapped(
      "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML",
      { maxBytes: 8_000, timeoutMs: 12_000, headers: { accept: "application/xml" } },
    )
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const header = parseOfacHeader(response.text)
    if (!header) throw new Error("SDN.XML header had no record count")
    return { itemCount: header.recordCount, detail: `SDN.XML published ${header.publishDate}, ${header.recordCount.toLocaleString("en-US")} entries` }
  })
}

async function kev(): Promise<SweepPartial> {
  return source("cisa-kev", async () => {
    const response = await fetchCapped(
      "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
      { maxBytes: 64_000, timeoutMs: 12_000 },
    )
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const head = parseKevHead(response.text)
    if (!head) throw new Error("KEV catalog header missing")
    return {
      itemCount: head.cves.length,
      detail: `Catalog ${head.catalogVersion} lists ${head.count.toLocaleString("en-US")}. Newest in this read: ${head.cves.join(", ")}`,
    }
  })
}

async function safecast(): Promise<SweepPartial> {
  return source("safecast", async (partial) => {
    const sites = [
      { id: "chernobyl", label: "Chernobyl", lat: 51.39, lon: 30.1 },
      { id: "zaporizhzhia", label: "Zaporizhzhia", lat: 47.51, lon: 34.58 },
      { id: "los-angeles", label: "Los Angeles", lat: 34.05, lon: -118.24 },
      { id: "new-york", label: "New York", lat: 40.71, lon: -74.01 },
    ]
    const now = Date.now()
    let readings = 0
    for (const site of sites) {
      const response = await fetchCapped(
        `https://api.safecast.org/measurements.json?latitude=${site.lat}&longitude=${site.lon}&distance=80000&limit=8`,
        { maxBytes: 40_000 },
      )
      const rows = readJson<SafecastRow[]>(response.text, response.status)
      if (!Array.isArray(rows) || rows.length === 0) continue
      readings += rows.length
      const values = rows.map((row) => row.value).filter((value): value is number => typeof value === "number")
      const latest = [...rows].sort((a, b) => Date.parse(b.captured_at || "") - Date.parse(a.captured_at || ""))[0]
      const unit = latest?.unit === "usv" ? "usv" : "cpm"
      const baseline = median(values.filter((value) => value !== latest?.value)) || median(values)
      if (latest?.value == null || baseline == null) continue
      const sample: RadiationSample = {
        id: site.id,
        network: "safecast",
        label: site.label,
        lat: site.lat,
        lon: site.lon,
        value: latest.value,
        baseline,
        unit,
        epaElevated: false,
        observedAtMs: latest.captured_at ? Date.parse(latest.captured_at) : null,
        nowMs: now,
      }
      partial.radiation.push(sample)
      partial.markers.push(placeMarker({
        id: `safe-${site.id}`,
        sourceId: "safecast",
        kind: "Radiation",
        title: `${site.label} ${latest.value} ${unit}`,
        detail: `Safecast sample ${latest.captured_at || "undated"}`,
        lat: site.lat,
        lon: site.lon,
        severity: "info",
      }))
    }
    return { itemCount: readings, detail: `${readings} samples at ${sites.length} sites` }
  })
}

const RADNET_STATIONS = [
  { id: "la", label: "Los Angeles", lat: 34.05, lon: -118.24, path: "CA/LOS%20ANGELES" },
  { id: "nyc", label: "New York", lat: 40.71, lon: -74.01, path: "NY/NYC%20(EML)" },
]

async function epa(): Promise<SweepPartial> {
  return source("epa-radnet", async (partial) => {
    const year = new Date().getUTCFullYear()
    const now = Date.now()
    const settled = await Promise.all(RADNET_STATIONS.map(async (station) => {
      try {
        const response = await fetchTail(
          `https://radnet.epa.gov/cdx-radnet-rest/api/rest/csv/${year}/fixed/${station.path}`,
          6_000,
          12_000,
        )
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return { station, reading: parseRadnetTail(response.text, now), error: null as string | null }
      } catch (error) {
        return { station, reading: null, error: failureMessage(error) }
      }
    }))
    const failures = settled.filter((item) => item.error)
    for (const item of settled) {
      if (!item.reading) continue
      partial.radiation.push({
        id: `epa-${item.station.id}`,
        network: "epa",
        label: `${item.station.label} gamma`,
        lat: item.station.lat,
        lon: item.station.lon,
        value: item.reading.doseNsvPerHour,
        baseline: item.reading.baselineNsvPerHour,
        unit: "other",
        epaElevated: item.reading.elevated,
        observedAtMs: item.reading.observedAtMs,
        nowMs: now,
      })
      partial.markers.push(placeMarker({
        id: `epa-${item.station.id}`,
        sourceId: "epa-radnet",
        kind: "Radiation",
        title: `${item.station.label} ${Math.round(item.reading.doseNsvPerHour)} nSv/h`,
        detail: "EPA RadNet gamma dose equivalent",
        lat: item.station.lat,
        lon: item.station.lon,
        severity: item.reading.elevated ? "routine" : "info",
      }))
    }
    const kept = settled.filter((item) => item.reading)
    if (kept.length === 0) throw new Error(failures[0]?.error || "RadNet CSV tail had no dose rows")
    const summary = kept.map((item) => `${item.station.label} ${Math.round(item.reading!.doseNsvPerHour)} nSv/h`).join(", ")
    const note = failures.length ? `; ${failures.map((item) => item.station.label).join(", ")} failed` : ""
    return { itemCount: kept.length, detail: `${summary}${note}` }
  })
}

async function adsb(): Promise<SweepPartial> {
  return source("adsb-lol", async (partial) => {
    const boxes = [
      "https://api.adsb.lol/v2/mil",
      "https://api.adsb.lol/v2/lat/-1.29/lon/36.82/dist/40",
      "https://api.adsb.lol/v2/lat/-26.13/lon/28.24/dist/40",
      "https://api.adsb.lol/v2/lat/30.12/lon/31.41/dist/40",
    ]
    const responses = await Promise.all(boxes.map((url) => fetchCapped(url, { maxBytes: 32_000, timeoutMs: 8_000 })))
    const seen = new Set<string>()
    let aircraft = 0
    for (const response of responses) {
      if (!response.ok) continue
      for (const point of adsbPoints(response.text, 12)) {
        if (seen.has(point.hex)) continue
        seen.add(point.hex)
        aircraft += 1
        partial.markers.push(placeMarker({
          id: `adsb-${point.hex}`,
          sourceId: "adsb-lol",
          kind: "Flight",
          title: point.flight || point.hex,
          detail: "adsb.lol position",
          lat: point.lat,
          lon: point.lon,
          severity: "info",
        }))
      }
    }
    if (responses.every((response) => !response.ok)) throw new Error(`HTTP ${responses[0]?.status ?? 0}`)
    return { itemCount: aircraft, detail: `${aircraft} positions from adsb.lol` }
  })
}

async function bluesky(): Promise<SweepPartial> {
  return source("bluesky", async (partial) => {
    const response = await fetchCapped(
      "https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=earthquake&limit=8&sort=latest",
      { maxBytes: 80_000, headers: { accept: "application/json" } },
    )
    if (response.status === 403) throw new Error("HTTP 403 from Bluesky")
    const body = readJson<{ posts?: { record?: { text?: string }; author?: { handle?: string }; indexedAt?: string }[] }>(response.text, response.status)
    const posts = body.posts ?? []
    for (const post of posts.slice(0, 6)) {
      const text = post.record?.text?.replace(/\s+/g, " ").trim()
      if (!text) continue
      partial.headlines.push({
        title: text.slice(0, 180),
        source: post.author?.handle ? `@${post.author.handle}` : "Bluesky",
        url: "https://bsky.app",
        publishedAt: post.indexedAt ?? null,
      })
    }
    return { itemCount: posts.length, detail: `${posts.length} posts` }
  })
}

async function openSanctions(key: string): Promise<SweepPartial> {
  return source("opensanctions", async () => {
    const response = await fetchCapped("https://api.opensanctions.org/search/default?q=sanction&limit=5", {
      headers: { authorization: `ApiKey ${key}` },
      maxBytes: 80_000,
    })
    const body = readJson<{ results?: unknown[]; total?: { value?: number } }>(response.text, response.status)
    const count = body.results?.length ?? 0
    return { itemCount: count, detail: body.total?.value != null ? `Search returned ${count} of ${body.total.value}` : `${count} matches` }
  })
}

async function reliefWeb(appname: string): Promise<SweepPartial> {
  return source("reliefweb", async (partial) => {
    const response = await fetchCapped(`https://api.reliefweb.int/v2/disasters?appname=${encodeURIComponent(appname)}`, {
      method: "POST",
      timeoutMs: 12_000,
      maxBytes: 120_000,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        limit: 12,
        profile: "list",
        preset: "latest",
        fields: { include: ["name", "date.created", "primary_country.name", "primary_country.location", "status"] },
      }),
    })
    const body = readJson<{ data?: { fields?: { name?: string; primary_country?: { name?: string; location?: { lat?: number; lon?: number } } } }[] }>(response.text, response.status)
    const rows = body.data ?? []
    for (const row of rows) {
      const loc = row.fields?.primary_country?.location
      if (loc?.lat == null || loc.lon == null) continue
      partial.markers.push(placeMarker({
        id: `rw-${row.fields?.name}`,
        sourceId: "reliefweb",
        kind: "Relief",
        title: row.fields?.name || "ReliefWeb disaster",
        detail: row.fields?.primary_country?.name || "ReliefWeb v2",
        lat: loc.lat,
        lon: loc.lon,
        severity: "info",
      }))
    }
    return { itemCount: rows.length, detail: `${rows.length} disasters from API v2` }
  })
}

async function radar(token: string): Promise<SweepPartial> {
  return source("cloudflare-radar", async () => {
    const response = await fetchCapped("https://api.cloudflare.com/client/v4/radar/annotations/outages?dateRange=7d&format=json", {
      headers: { authorization: `Bearer ${token}` },
      maxBytes: 120_000,
      timeoutMs: 12_000,
    })
    const body = readJson<{ result?: { annotations?: unknown[] } }>(response.text, response.status)
    const annotations = body.result?.annotations ?? []
    return { itemCount: annotations.length, detail: `${annotations.length} outage annotations in 7 days` }
  })
}

async function acled(email: string, password: string): Promise<SweepPartial> {
  return source("acled", async (partial) => {
    const tokenResponse = await fetchCapped("https://acleddata.com/oauth/token", {
      method: "POST",
      timeoutMs: 12_000,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: email, password, grant_type: "password", client_id: "acled" }).toString(),
    })
    const tokenBody = readJson<{ access_token?: string }>(tokenResponse.text, tokenResponse.status)
    if (!tokenBody.access_token) throw new Error("ACLED token missing")
    const since = new Date(Date.now() - 7 * DAY_MS).toISOString().slice(0, 10)
    const dataResponse = await fetchCapped(
      `https://acleddata.com/api/acled/read?_format=json&event_date=${since}&event_date_where=%3E%3D&limit=20&fields=event_id_cnty|event_date|event_type|country|latitude|longitude|fatalities`,
      { headers: { authorization: `Bearer ${tokenBody.access_token}` }, maxBytes: 120_000, timeoutMs: 12_000 },
    )
    const data = readJson<{ data?: { event_id_cnty?: string; event_type?: string; country?: string; latitude?: string; longitude?: string; fatalities?: string }[] }>(dataResponse.text, dataResponse.status)
    const rows = data.data ?? []
    for (const row of rows) {
      const lat = Number(row.latitude)
      const lon = Number(row.longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
      partial.markers.push(placeMarker({
        id: `acled-${row.event_id_cnty}`,
        sourceId: "acled",
        kind: "Conflict",
        title: `${row.event_type || "Event"} · ${row.country || ""}`.trim(),
        detail: row.fatalities ? `${row.fatalities} fatalities reported` : "ACLED event",
        lat,
        lon,
        severity: Number(row.fatalities) > 0 ? "priority" : "info",
      }))
    }
    return { itemCount: rows.length, detail: `${rows.length} events since ${since}` }
  })
}

async function fredApi(key: string): Promise<SweepPartial> {
  return source("fred-api", async () => {
    const series = ["DFF", "CPIAUCSL"]
    const observations = await Promise.all(series.map(async (id) => {
      const response = await fetchCapped(
        `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${encodeURIComponent(key)}&file_type=json&sort_order=desc&limit=5`,
        { maxBytes: 20_000 },
      )
      const body = readJson<{ observations?: { date?: string; value?: string }[] }>(response.text, response.status)
      const row = body.observations?.find((observation) => observation.value && observation.value !== ".")
      return row ? `${id} ${row.value} (${row.date})` : null
    }))
    const ready = observations.filter((line): line is string => Boolean(line))
    if (ready.length === 0) throw new Error("No FRED observations")
    return { itemCount: ready.length, detail: ready.join("; ") }
  })
}

async function eia(key: string): Promise<SweepPartial> {
  return source("eia", async () => {
    const response = await fetchCapped(
      `https://api.eia.gov/v2/petroleum/pri/spt/data/?api_key=${encodeURIComponent(key)}&frequency=daily&data[0]=value&facets[series][]=RWTC&sort[0][column]=period&sort[0][direction]=desc&length=1`,
      { maxBytes: 40_000, timeoutMs: 12_000 },
    )
    const body = readJson<{ response?: { data?: { period?: string; value?: number }[] } }>(response.text, response.status)
    const row = body.response?.data?.[0]
    if (!row || row.value == null) throw new Error("No WTI spot row")
    return { itemCount: 1, detail: `WTI Cushing ${row.value} on ${row.period}` }
  })
}

async function firms(key: string): Promise<SweepPartial> {
  return source("firms", async (partial) => {
    const boxes = ["2,3,14,15", "33,-119,35,-117"]
    let rows = 0
    for (const box of boxes) {
      const response = await fetchCapped(
        `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/VIIRS_SNPP_NRT/${box}/1`,
        { maxBytes: 48_000, timeoutMs: 12_000 },
      )
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const lines = response.text.trim().split("\n")
      const headers = lines[0]?.split(",") ?? []
      const latIndex = headers.indexOf("latitude")
      const lonIndex = headers.indexOf("longitude")
      for (const line of lines.slice(1, 16)) {
        const cols = line.split(",")
        const lat = Number(cols[latIndex])
        const lon = Number(cols[lonIndex])
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
        rows += 1
        partial.markers.push(placeMarker({
          id: `firms-${lat}-${lon}`,
          sourceId: "firms",
          kind: "Fire",
          title: "VIIRS thermal",
          detail: "NASA FIRMS detection in the last day",
          lat,
          lon,
          severity: "info",
        }))
      }
    }
    return { itemCount: rows, detail: `${rows} detections in Nigeria and southern California boxes` }
  })
}

async function reddit(clientId: string, clientSecret: string): Promise<SweepPartial> {
  return source("reddit", async (partial) => {
    const tokenResponse = await fetchCapped("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    })
    const token = readJson<{ access_token?: string }>(tokenResponse.text, tokenResponse.status)
    if (!token.access_token) throw new Error("Reddit token missing")
    const listing = await fetchCapped("https://oauth.reddit.com/r/worldnews/hot?limit=8", {
      headers: { authorization: `Bearer ${token.access_token}`, "user-agent": USER_AGENT },
      maxBytes: 80_000,
    })
    const body = readJson<{ data?: { children?: { data?: { title?: string; permalink?: string; created_utc?: number } }[] } }>(listing.text, listing.status)
    const posts = body.data?.children ?? []
    for (const post of posts) {
      if (!post.data?.title) continue
      partial.headlines.push({
        title: post.data.title,
        source: "Reddit r/worldnews",
        url: post.data.permalink ? `https://www.reddit.com${post.data.permalink}` : "https://www.reddit.com/r/worldnews",
        publishedAt: post.data.created_utc ? new Date(post.data.created_utc * 1000).toISOString() : null,
      })
    }
    return { itemCount: posts.length, detail: `${posts.length} posts` }
  })
}

function adsbPoints(text: string, limit: number): { hex: string; lat: number; lon: number; flight: string }[] {
  const points: { hex: string; lat: number; lon: number; flight: string }[] = []
  for (const match of text.matchAll(/"hex":"([0-9a-fA-F]+)"/g)) {
    const window = text.slice(match.index ?? 0, (match.index ?? 0) + 1600)
    const lat = window.match(/"lat":(-?\d+(?:\.\d+)?)/)
    const lon = window.match(/"lon":(-?\d+(?:\.\d+)?)/)
    if (!lat || !lon) continue
    const flight = window.match(/"flight":"([^"]*)"/)
    points.push({
      hex: match[1],
      lat: Number(lat[1]),
      lon: Number(lon[1]),
      flight: (flight?.[1] ?? match[1]).trim(),
    })
    if (points.length >= limit) break
  }
  return points
}

function featurePoint(feature: NwsFeature): { lat: number; lon: number } | null {
  const geometry = feature.geometry
  if (!geometry) return null
  if (geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
    const lon = geometry.coordinates[0]
    const lat = geometry.coordinates[1]
    if (typeof lat === "number" && typeof lon === "number") return { lat, lon }
    return null
  }
  const coords = flattenCoords(geometry.coordinates)
  if (coords.length === 0) return null
  const lat = coords.reduce((sum, pair) => sum + pair[1], 0) / coords.length
  const lon = coords.reduce((sum, pair) => sum + pair[0], 0) / coords.length
  return { lat, lon }
}

function flattenCoords(value: unknown): [number, number][] {
  if (!Array.isArray(value)) return []
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    return [[value[0], value[1]]]
  }
  return value.flatMap((entry) => flattenCoords(entry))
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function weatherLabel(code: number): string {
  if (code === 0) return "Clear"
  if (code <= 3) return "Cloudy"
  if (code <= 48) return "Fog"
  if (code <= 67) return "Rain"
  if (code <= 77) return "Snow"
  if (code <= 82) return "Showers"
  if (code >= 95) return "Thunderstorm"
  return "Mixed conditions"
}

type UsgsFeature = {
  id?: string
  geometry?: { coordinates?: number[] }
  properties?: { mag?: number; place?: string; alert?: string | null; tsunami?: number; code?: string }
}
type EonetEvent = {
  id: string
  title: string
  categories?: { title?: string }[]
  geometry?: { type?: string; coordinates?: [number, number] }[]
}
type GdacsFeature = {
  geometry?: { coordinates?: [number, number] }
  properties?: { eventid?: number; eventtype?: string; eventname?: string; name?: string; alertlevel?: string }
}
type NwsFeature = {
  geometry?: { type?: string; coordinates?: unknown }
  properties?: { id?: string; event?: string; headline?: string; areaDesc?: string }
}
type YahooChart = {
  chart?: {
    result?: {
      meta?: { regularMarketPrice?: number; fulldayChange?: number }
      indicators?: { quote?: { close?: (number | null)[] }[] }
    }[]
  }
}
type MeteoRow = { current?: { temperature_2m?: number; weather_code?: number } }
type SafecastRow = { value?: number; unit?: string; captured_at?: string }
