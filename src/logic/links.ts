/** Public page for a source when an item has no URL of its own. */
export const SOURCE_HOME: Record<string, string> = {
  usgs: "https://earthquake.usgs.gov/earthquakes/map/",
  eonet: "https://eonet.gsfc.nasa.gov/",
  gdacs: "https://www.gdacs.org/",
  nws: "https://www.weather.gov/",
  "open-meteo": "https://open-meteo.com/",
  iss: "https://wheretheiss.at/",
  celestrak: "https://celestrak.org/",
  safecast: "https://map.safecast.org/",
  "epa-radnet": "https://www.epa.gov/radnet",
  "adsb-lol": "https://adsb.lol/",
  firms: "https://firms.modaps.eosdis.nasa.gov/map/",
  acled: "https://acleddata.com/",
  reliefweb: "https://reliefweb.int/",
  "cloudflare-radar": "https://radar.cloudflare.com/",
  bbc: "https://www.bbc.com/news/world",
  guardian: "https://www.theguardian.com/world",
  aljazeera: "https://www.aljazeera.com/",
  who: "https://www.who.int/news",
  gdelt: "https://www.gdeltproject.org/",
  yahoo: "https://finance.yahoo.com/",
  bluesky: "https://bsky.app/",
  reddit: "https://www.reddit.com/r/worldnews/",
  chokepoint: "https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints",
}

export function resolveItemUrl(sourceId: string, url?: string | null): string {
  const trimmed = url?.trim() ?? ""
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return SOURCE_HOME[sourceId] ?? "https://news.montarx.com/"
}

export function usgsEventUrl(code?: string | null, raw?: string | null): string {
  return resolveItemUrl("usgs", raw || (code ? `https://earthquake.usgs.gov/earthquakes/eventpage/${code}` : null))
}

export function gdacsEventUrl(eventType?: string | null, eventId?: string | number | null): string {
  if (!eventType || eventId == null || eventId === "") return resolveItemUrl("gdacs", null)
  return `https://www.gdacs.org/report.aspx?eventtype=${encodeURIComponent(eventType)}&eventid=${encodeURIComponent(String(eventId))}`
}

export function nwsAlertUrl(id?: string | null): string {
  if (id && /^https?:\/\//i.test(id)) return id
  return resolveItemUrl("nws", null)
}

export function firmsMapUrl(lat: number, lon: number): string {
  return `https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@${lon.toFixed(2)},${lat.toFixed(2)},6z`
}

export function adsbUrl(hex?: string | null): string {
  if (hex) return `https://adsb.lol/?icao=${encodeURIComponent(hex)}`
  return resolveItemUrl("adsb-lol", null)
}

export function yahooQuoteUrl(symbol: string): string {
  return `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`
}

export function fredSeriesUrl(seriesId: string): string {
  return `https://fred.stlouisfed.org/series/${encodeURIComponent(seriesId)}`
}
