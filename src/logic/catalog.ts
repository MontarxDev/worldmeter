import type { CatalogSource } from "./status"

/**
 * Every row the Sources panel can show. Keyed sources stay in the catalog
 * so a missing secret is "not configured" instead of a silent omission.
 */
export const CATALOG: readonly CatalogSource[] = [
  { id: "usgs", label: "USGS earthquakes", tier: "Hazards", description: "Magnitude 4.5+ earthquakes over the last 24 hours, including PAGER alert level and the tsunami flag.", env: null },
  { id: "eonet", label: "NASA EONET", tier: "Hazards", description: "Natural events NASA EONET recorded in the last 30 days.", env: null },
  { id: "gdacs", label: "GDACS", tier: "Hazards", description: "Global Disaster Alert and Coordination System events and alert colors.", env: null },
  { id: "nws", label: "NOAA/NWS alerts", tier: "Hazards", description: "Active US National Weather Service warnings. Extreme alerts are plotted; the count is the full active set.", env: null },
  { id: "bbc", label: "BBC World", tier: "News", description: "BBC News world RSS headlines.", env: null },
  { id: "guardian", label: "The Guardian", tier: "News", description: "Guardian world RSS headlines.", env: null },
  { id: "aljazeera", label: "Al Jazeera", tier: "News", description: "Al Jazeera English RSS headlines.", env: null },
  { id: "who", label: "WHO", tier: "News", description: "World Health Organization English news RSS.", env: null },
  { id: "gdelt", label: "GDELT", tier: "News", description: "GDELT DOC 2.0 recent English-language articles. The project asks callers to wait between requests.", env: null },
  { id: "yahoo", label: "Yahoo Finance", tier: "Markets", description: "Index, volatility, energy, metal, and bitcoin last prices. Percent changes use the prior daily session close.", env: null },
  { id: "frankfurter", label: "Frankfurter / ECB", tier: "Markets", description: "ECB reference rates via the Frankfurter API.", env: null },
  { id: "treasury-debt", label: "US Treasury debt", tier: "Markets", description: "Debt to the penny from the Treasury Fiscal Data API.", env: null },
  { id: "fred-yield-csv", label: "FRED 10Y–2Y CSV", tier: "Markets", description: "Public FRED graph CSV for T10Y2Y. No API key.", env: null },
  { id: "fred-hy-csv", label: "FRED HY OAS CSV", tier: "Markets", description: "Public FRED graph CSV for BAMLH0A0HYM2 (ICE BofA US high-yield OAS). No API key.", env: null },
  { id: "fred-macro", label: "FRED macro CSVs", tier: "Markets", description: "Public FRED graph CSVs for the broad dollar, initial claims, the 30-year mortgage rate, and M2. No API key.", env: null },
  { id: "gscpi", label: "NY Fed GSCPI", tier: "Markets", description: "Global Supply Chain Pressure Index, latest vintage from the NY Fed CSV.", env: null },
  { id: "bls", label: "BLS unemployment", tier: "Markets", description: "US unemployment rate, series LNS14000000, public BLS API v1.", env: null },
  { id: "open-meteo", label: "Open-Meteo", tier: "Environment", description: "Current conditions for eight cities, including Lagos, Nairobi, Johannesburg, and Cairo.", env: null },
  { id: "cisa-kev", label: "CISA KEV", tier: "Technology", description: "CISA Known Exploited Vulnerabilities catalog. The Worker reads the catalog header and the newest entries.", env: null },
  { id: "celestrak", label: "CelesTrak", tier: "Space", description: "CelesTrak stations group (ISS and crew vehicles).", env: null },
  { id: "iss", label: "ISS position", tier: "Space", description: "Current International Space Station latitude and longitude from wheretheiss.at.", env: null },
  { id: "donki", label: "NASA DONKI", tier: "Space", description: "NASA space-weather notifications for the last few days, using NASA's public DEMO_KEY.", env: null },
  { id: "adsb-lol", label: "adsb.lol", tier: "Flights", description: "Community ADS-B positions from adsb.lol (military sample plus Nairobi, Johannesburg, and Cairo). This is not ADS-B Exchange.", env: null },
  { id: "safecast", label: "Safecast", tier: "Radiation", description: "Recent citizen-science samples near Chernobyl, Zaporizhzhia, Los Angeles, and New York.", env: null },
  { id: "epa-radnet", label: "EPA RadNet", tier: "Radiation", description: "Near-real-time gamma dose from the official RadNet CSV (Los Angeles and New York). A radiation flash also needs a Safecast jump within 800 km.", env: null },
  { id: "ofac", label: "OFAC SDN", tier: "Sanctions", description: "Official SDN.XML publication header: record count and publish date from the Treasury sanctions list service.", env: null },
  { id: "bluesky", label: "Bluesky", tier: "Social", description: "Recent public posts from the Bluesky AppView search API. No key. Failures stay errors.", env: null },
  { id: "opensanctions", label: "OpenSanctions", tier: "Sanctions", description: "OpenSanctions search API.", env: ["OPENSANCTIONS_API_KEY"] },
  { id: "reliefweb", label: "ReliefWeb v2", tier: "Hazards", description: "ReliefWeb API v2 disasters. The v1 API is retired. An approved appname is required.", env: ["RELIEFWEB_APPNAME"] },
  { id: "cloudflare-radar", label: "Cloudflare Radar", tier: "Networks", description: "Radar outage annotations. Requires an API token with Account Analytics Read.", env: ["CLOUDFLARE_RADAR_TOKEN"] },
  { id: "acled", label: "ACLED", tier: "Conflict", description: "Armed conflict events via ACLED OAuth (email and password).", env: ["ACLED_EMAIL", "ACLED_PASSWORD"] },
  { id: "fred-api", label: "FRED API", tier: "Markets", description: "Optional Federal Reserve series (fed funds, CPI) via the FRED API. Yield-curve and HY gauges use the public CSVs and do not depend on this key.", env: ["FRED_API_KEY"] },
  { id: "eia", label: "EIA", tier: "Markets", description: "Optional US Energy Information Administration WTI spot price.", env: ["EIA_API_KEY"] },
  { id: "firms", label: "NASA FIRMS", tier: "Hazards", description: "Optional thermal detections for Nigeria and southern California. NOAA-20 is read first; NOAA-21, then MODIS, is used when that feed is empty or errors. The detail names the satellite that returned rows.", env: ["FIRMS_MAP_KEY"] },
  { id: "reddit", label: "Reddit", tier: "Social", description: "Optional r/worldnews hot posts. Requires a Reddit script app.", env: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"] },
]

export function catalogById(id: string): CatalogSource {
  const source = CATALOG.find((entry) => entry.id === id)
  if (!source) throw new Error(`Unknown source ${id}`)
  return source
}
