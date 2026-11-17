import type { Headline, Snapshot } from "../logic/assemble"
import { formatChange } from "../logic/markets"
import type { Marker } from "../logic/markers"
import type { Signal } from "../logic/signals"
import { eventType } from "./icons"

export type DetailItem = {
  id: string
  title: string
  kind: string
  detail: string
  url: string
  lat: number | null
  lon: number | null
  observedAt: string | null
  figures: string | null
  severity: string | null
}

export function markerLayer(kind: string, title = ""): string {
  return eventType(kind, title)
}

export function markerDetail(marker: Marker): DetailItem {
  return {
    id: marker.id,
    title: marker.title,
    kind: marker.kind,
    detail: marker.detail,
    url: marker.url,
    lat: marker.lat,
    lon: marker.lon,
    observedAt: marker.observedAt,
    figures: marker.figures,
    severity: marker.severity,
  }
}

export function signalDetail(signal: Signal): DetailItem {
  return {
    id: signal.id,
    title: signal.title,
    kind: signal.kind,
    detail: signal.detail,
    url: signal.url,
    lat: signal.lat,
    lon: signal.lon,
    observedAt: signal.observedAt,
    figures: signal.figures,
    severity: signal.tier,
  }
}

export function headlineDetail(item: Headline): DetailItem {
  const located = item.place && item.place !== "reported location"
  return {
    id: item.url,
    title: item.title,
    kind: "Headline",
    detail: located
      ? `${item.source}. Headline mentions ${item.place}. The pin is that place, not a measured event location.`
      : item.lat != null
        ? `${item.source}. This feed included coordinates.`
        : item.source,
    url: item.url,
    lat: item.lat,
    lon: item.lon,
    observedAt: item.publishedAt,
    figures: null,
    severity: null,
  }
}

export function DetailCard({
  item,
  sweepAt,
  onClose,
}: {
  item: DetailItem
  sweepAt: string
  onClose: () => void
}) {
  const when = item.observedAt ? formatWhen(item.observedAt) : null
  const sweep = formatWhen(sweepAt)
  return (
    <article className="detail" role="dialog" aria-labelledby="detail-title">
      <header>
        <span className="pill ok">{item.kind}</span>
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </header>
      <h2 id="detail-title">{item.title}</h2>
      {item.severity && <p className="meta">Level {item.severity}</p>}
      <p>{when ? `${when.relative} · ${when.absolute}` : `No item time published. Sweep ${sweep.relative} · ${sweep.absolute}`}</p>
      <p>{item.lat != null && item.lon != null ? `${item.lat.toFixed(2)}°, ${item.lon.toFixed(2)}°` : "No ground position"}</p>
      {item.figures && <p className="figures">{item.figures}</p>}
      <p>{item.detail}</p>
      <a className="source-link" href={item.url} target="_blank" rel="noopener noreferrer">Open source</a>
    </article>
  )
}

export function SensorGrid({ snapshot, onOpen }: { snapshot: Snapshot; onOpen: (marker: Marker) => void }) {
  const who = snapshot.headlines.filter((item) => /who/i.test(item.source)).length
  const stations = snapshot.sources.find((source) => source.id === "celestrak")
  const rows = [
    ["Air", snapshot.markers.filter((marker) => markerLayer(marker.kind, marker.title) === "weather").length, "Open-Meteo cities and NWS extreme alerts"],
    ["Thermal", snapshot.markers.filter((marker) => markerLayer(marker.kind, marker.title) === "fire").length, "FIRMS detections plus EONET wildfires and volcanoes"],
    ["Nuclear", snapshot.markers.filter((marker) => marker.kind === "Radiation").length, "Safecast samples and EPA RadNet stations"],
    ["Conflict", snapshot.markers.filter((marker) => marker.kind === "Conflict").length, "ACLED events when the key is set"],
    ["Health", who, "WHO headlines in this sweep"],
    ["World news", snapshot.headlines.length, "RSS and GDELT items after de-duplication"],
    ["Flights", snapshot.markers.filter((marker) => marker.kind === "Flight").length, "adsb.lol positions, not ADS-B Exchange"],
    ["Satellites", stations?.itemCount ?? 0, stations?.detail || "CelesTrak stations group"],
    ["Quakes", snapshot.markers.filter((marker) => marker.kind === "Quake").length, "USGS magnitude 4.5+ in 24 hours"],
    ["Chokepoints", snapshot.markers.filter((marker) => marker.kind === "Chokepoint").length, "Fixed straits, not live AIS"],
  ] as const
  return (
    <section className="panel wide" aria-labelledby="sensors-heading">
      <h2 id="sensors-heading">Sensor grid</h2>
      <p className="meta">Counts from this sweep. A zero means the feed returned nothing, not that the sensor is healthy.</p>
      <div className="grid-cards">
        {rows.map(([label, count, note]) => (
          <article key={label} className="gauge">
            <header>
              <h3>{label}</h3>
              <span>{count}</span>
            </header>
            <p className="formula">{note}</p>
          </article>
        ))}
      </div>
      <h3>Signal core</h3>
      <p>
        {snapshot.markers.filter((marker) => marker.kind === "Flight").length} flights,{" "}
        {snapshot.markers.filter((marker) => markerLayer(marker.kind, marker.title) === "fire").length} thermal points,{" "}
        {snapshot.markers.filter((marker) => marker.kind === "Quake").length} quakes,{" "}
        {who} WHO headlines,{" "}
        {snapshot.markers.filter((marker) => marker.kind === "Chokepoint").length} chokepoints on the map.
      </p>
      <ul className="feed">
        {snapshot.markers.slice(0, 12).map((marker) => (
          <li key={marker.id}>
            <button type="button" className="row-btn" onClick={() => onOpen(marker)}>
              <strong>{marker.kind}</strong> {marker.title}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function NuclearWatch({ snapshot, onOpen }: { snapshot: Snapshot; onOpen: (marker: Marker) => void }) {
  const rows = snapshot.markers.filter((marker) => marker.kind === "Radiation")
  return (
    <section className="panel wide" aria-labelledby="nuclear-heading">
      <h2 id="nuclear-heading">Nuclear watch</h2>
      <p className="meta">A reading is elevated only when this sweep’s rule says so. A quiet station stays on the list.</p>
      {rows.length === 0 && <p>No radiation samples in this sweep.</p>}
      <ul className="feed">
        {rows.map((marker) => (
          <li key={marker.id}>
            <button type="button" className="row-btn" onClick={() => onOpen(marker)}>
              <strong>{marker.severity === "info" ? "Normal" : "Elevated"}</strong>
              <span>{marker.title}</span>
              <span className="meta">{marker.figures || marker.detail}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function SpaceWatch({ snapshot, onOpen }: { snapshot: Snapshot; onOpen: (marker: Marker) => void }) {
  const iss = snapshot.markers.find((marker) => marker.kind === "ISS")
  const stations = snapshot.sources.find((source) => source.id === "celestrak")
  const donki = snapshot.sources.find((source) => source.id === "donki")
  return (
    <section className="panel wide" aria-labelledby="space-heading">
      <h2 id="space-heading">Space watch</h2>
      {iss ? (
        <button type="button" className="row-btn" onClick={() => onOpen(iss)}>
          <strong>ISS</strong>
          <span>{iss.figures || iss.detail}</span>
          <span className="meta">{iss.lat.toFixed(2)}°, {iss.lon.toFixed(2)}°</span>
        </button>
      ) : (
        <p>ISS position is missing from this sweep.</p>
      )}
      <p>{stations ? `${stations.label}: ${stations.detail || `${stations.itemCount} objects`}` : "CelesTrak did not report."}</p>
      <p>{donki ? `${donki.label}: ${donki.detail || donki.error || `${donki.itemCount} notices`}` : "DONKI did not report."}</p>
      <p className="meta">Starlink, OneWeb, and the military catalogs are multi-megabyte files. A free Worker has about 10 ms of CPU, so those groups are not downloaded.</p>
    </section>
  )
}

const MARKET_GROUPS = [
  { id: "indexes", label: "Indexes", symbols: ["^GSPC", "^IXIC", "^VIX"] },
  { id: "energy", label: "Energy", symbols: ["CL=F"] },
  { id: "metals", label: "Metals", symbols: ["GC=F"] },
  { id: "crypto", label: "Crypto", symbols: ["BTC-USD"] },
]

export function MacroPanel({
  snapshot,
  onQuote,
  onMacro,
}: {
  snapshot: Snapshot
  onQuote: (symbol: string) => void
  onMacro: (id: string) => void
}) {
  return (
    <section className="panel wide" aria-labelledby="macro-heading">
      <h2 id="macro-heading">Macro</h2>
      <p className="meta">Percent changes use the prior session close. The line is the last few daily closes from the same chart.</p>
      {MARKET_GROUPS.map((group) => {
        const quotes = snapshot.markets.filter((quote) => group.symbols.includes(quote.symbol))
        if (quotes.length === 0) return null
        return (
          <div key={group.id}>
            <h3>{group.label}</h3>
            {quotes.map((quote) => (
              <button key={quote.symbol} type="button" className="row-btn" onClick={() => onQuote(quote.symbol)}>
                <strong>{quote.label}</strong>
                <span>{quote.price.toLocaleString("en-US")}</span>
                <span className={quote.changePct > 0.05 ? "up" : quote.changePct < -0.05 ? "down" : "flat"}>{formatChange(quote.changePct)}</span>
                <Spark values={quote.spark ?? []} />
              </button>
            ))}
          </div>
        )
      })}
      <h3>FRED, no key</h3>
      {(snapshot.macro ?? []).length === 0 && <p>The public FRED CSVs did not return a figure this sweep.</p>}
      <ul className="feed">
        {(snapshot.macro ?? []).map((figure) => (
          <li key={figure.id}>
            <button type="button" className="row-btn" onClick={() => onMacro(figure.id)}>
              <strong>{figure.label}</strong>
              <span>{figure.value}</span>
              <span className="meta">{figure.asOf}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="stats">
        {snapshot.debt && <p className="stat"><strong>${snapshot.debt.trillions.toFixed(2)}T</strong> US public debt, {snapshot.debt.asOf}</p>}
        {snapshot.unemployment && <p className="stat"><strong>{snapshot.unemployment.rate.toFixed(1)}%</strong> US unemployment, {snapshot.unemployment.asOf}</p>}
        {snapshot.fx.length > 0 && <p className="stat">{snapshot.fx.map((rate) => `${rate.pair} ${rate.rate.toFixed(2)}`).join(" · ")}</p>}
      </div>
    </section>
  )
}

export function DeltaPanel({ snapshot }: { snapshot: Snapshot }) {
  const delta = snapshot.delta
  return (
    <section className="panel wide" aria-labelledby="delta-heading">
      <h2 id="delta-heading">Sweep delta</h2>
      <p>{delta?.headline || "This snapshot has no comparison yet."}</p>
      {delta?.comparedTo && <p className="meta">Compared with the snapshot stored at {delta.comparedTo}.</p>}
      <ul className="feed">
        {(delta?.marketMoves ?? []).map((move) => (
          <li key={move.label}>
            {move.label}: {move.from.toLocaleString("en-US")} → {move.to.toLocaleString("en-US")} ({move.pct > 0 ? "+" : ""}{move.pct.toFixed(2)}% since the last stored sweep)
          </li>
        ))}
      </ul>
      <p className="meta">This is the change between stored sweeps. The market cards still show the change versus the prior session close.</p>
    </section>
  )
}

export function Glossary() {
  return (
    <section className="panel wide" aria-labelledby="glossary-heading">
      <h2 id="glossary-heading">What the signals mean</h2>
      <ul className="feed">
        <li>VIX is the index level on a 0–40 gauge. Its percent uses the prior session close.</li>
        <li>The yield gauge is the 10-year minus the 2-year, from the public FRED T10Y2Y CSV.</li>
        <li>GSCPI is the NY Fed supply-chain index. It is not an oil series.</li>
        <li>High-yield OAS is ICE BofA US high yield, series BAMLH0A0HYM2.</li>
        <li>The quake gauge counts USGS events of magnitude 4.5 or more in 24 hours.</li>
        <li>A quake toast follows USGS PAGER. A green magnitude 6 is not a flash.</li>
        <li>A radiation flash needs a real jump and a second network within 800 km.</li>
        <li>EONET counts events in the last 30 days, not open incidents.</li>
        <li>OFAC is the SDN.XML header: record count and publish date.</li>
        <li>Flights are labeled adsb.lol. They are not ADS-B Exchange.</li>
      </ul>
    </section>
  )
}

export function WireList({ headlines, onOpen }: { headlines: readonly Headline[]; onOpen: (item: Headline) => void }) {
  return (
    <section className="panel" aria-labelledby="wire-heading">
      <h2 id="wire-heading">Wire</h2>
      {headlines.length === 0 && <p className="meta">No headlines in this sweep.</p>}
      <ul className="feed">
        {headlines.slice(0, 28).map((item, index) => (
          <li key={`${item.url}-${index}`}>
            <button type="button" className="row-btn" onClick={() => onOpen(item)}>
              <strong>{item.source}</strong>
              <span>{item.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function NewsPanel({ headlines, onOpen }: { headlines: readonly Headline[]; onOpen: (item: Headline) => void }) {
  return (
    <section className="panel wide" aria-labelledby="news-heading" data-testid="news-panel">
      <h2 id="news-heading">News</h2>
      <p className="meta">
        {headlines.length} stories from the RSS wires and GDELT.
        A story with a place name is pinned on that place. The pin is not a measured event location.
      </p>
      {headlines.length === 0 && <p>No stories in this sweep for the current country filter.</p>}
      <ul className="feed">
        {headlines.slice(0, 60).map((item, index) => (
          <li key={`${item.url}-${index}`}>
            <button type="button" className="row-btn" onClick={() => onOpen(item)}>
              <strong>{item.source}</strong>
              <span>{item.title}</span>
              {item.place && <span className="meta">{item.place === "reported location" ? "Feed coordinates" : item.place}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const d = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 72
    const y = 22 - ((value - min) / span) * 20
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(" ")
  return (
    <svg className="spark" viewBox="0 0 72 24" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

function formatWhen(iso: string): { relative: string; absolute: string } {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return { relative: "time not published", absolute: "time not published" }
  const absolute = `${new Date(ms).toISOString().replace("T", " ").slice(0, 16)} UTC`
  const minutes = Math.round((Date.now() - ms) / 60000)
  if (minutes < 1 && minutes >= 0) return { relative: "just now", absolute }
  if (minutes < 60) return { relative: `${minutes} min ago`, absolute }
  if (minutes < 60 * 48) return { relative: `${Math.round(minutes / 60)} hr ago`, absolute }
  if (minutes >= 60 * 48) return { relative: `${Math.round(minutes / 1440)} days ago`, absolute }
  return { relative: absolute, absolute }
}
