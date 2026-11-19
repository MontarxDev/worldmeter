import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import type { Snapshot } from "../logic/assemble"
import { featureContains, mentionsCountry, type CountryFeature } from "../logic/geo"
import { yahooQuoteUrl } from "../logic/links"
import { formatChange } from "../logic/markets"
import type { Marker } from "../logic/markers"
import { cardId, REGION_IDS, REGION_LABELS, type RegionId } from "../logic/regions"
import { eventType, EVENT_TYPES, Legend } from "./icons"
import type { MapFocus } from "./map-types"
import {
  DeltaPanel,
  DetailCard,
  Glossary,
  headlineDetail,
  MacroPanel,
  markerDetail,
  NewsPanel,
  NuclearWatch,
  SensorGrid,
  signalDetail,
  SpaceWatch,
  WireList,
  type DetailItem,
} from "./panels"

const GlobePanel = lazy(() => import("./GlobePanel").then((mod) => ({ default: mod.GlobePanel })))
const FlatMap = lazy(() => import("./FlatMap").then((mod) => ({ default: mod.FlatMap })))

type Pending = { ready: false; message: string }
type Payload = Snapshot | Pending
type ViewId = "board" | "news" | "sensors" | "nuclear" | "space" | "macro" | "delta" | "glossary"

const VIEWS: { id: ViewId; label: string }[] = [
  { id: "board", label: "Board" },
  { id: "news", label: "News" },
  { id: "sensors", label: "Sensors" },
  { id: "nuclear", label: "Nuclear" },
  { id: "space", label: "Space" },
  { id: "macro", label: "Macro" },
  { id: "delta", label: "Delta" },
  { id: "glossary", label: "Glossary" },
]

const STATUS_TEXT = {
  ok: "OK",
  empty: "Empty",
  error: "Error",
  not_configured: "Not configured",
} as const

export function App() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [region, setRegion] = useState<RegionId>("world")
  const [mode, setMode] = useState<"flat" | "globe">("flat")
  const [globePaused, setGlobePaused] = useState(false)
  const [tickerPaused, setTickerPaused] = useState(false)
  const [panel, setPanel] = useState<"sources" | "signals" | null>(null)
  const [view, setView] = useState<ViewId>("board")
  const [dismissed, setDismissed] = useState<string[]>([])
  const [layers, setLayers] = useState<string[]>(() => EVENT_TYPES.map((type) => type.id))
  const [countries, setCountries] = useState<CountryFeature[]>([])
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
  const [visuals, setVisuals] = useState<"full" | "lite">("full")
  const [detail, setDetail] = useState<DetailItem | null>(null)
  const [focus, setFocus] = useState<MapFocus | null>(null)

  useEffect(() => {
    let stop = false
    void fetch("/countries.geojson")
      .then((response) => response.json())
      .then((body: { features?: CountryFeature[] }) => {
        if (stop || !body.features) return
        setCountries(body.features)
        window.__worldmeterCountries = body.features
      })
      .catch(() => {
        if (!stop) setCountries([])
      })
    return () => {
      stop = true
    }
  }, [])

  useEffect(() => {
    const stored = window.localStorage.getItem("worldmeter-visuals")
    if (stored === "lite" || stored === "full") setVisuals(stored)
    else if (window.matchMedia("(max-width: 700px)").matches) setVisuals("lite")
  }, [])

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 960px)").matches
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (wide && !reduce && window.localStorage.getItem("worldmeter-visuals") !== "lite") {
      const id = window.setTimeout(() => setMode("globe"), 600)
      return () => window.clearTimeout(id)
    }
    return undefined
  }, [])

  useEffect(() => {
    let stop = false
    const load = async () => {
      try {
        const response = await fetch("/api/snapshot")
        if (!response.ok) throw new Error(`Snapshot HTTP ${response.status}`)
        const body = (await response.json()) as Payload
        if (!stop) {
          setData(body)
          setError(null)
        }
      } catch (err) {
        if (!stop) setError(err instanceof Error ? err.message : "Could not load the snapshot")
      }
    }
    void load()
    const timer = window.setInterval(load, 60_000)
    return () => {
      stop = true
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!panel && !detail) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPanel(null)
        setDetail(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [panel, detail])

  const snapshot = data && data.ready ? data : null
  const selectedFeature = useMemo(
    () => countries.find((feature) => feature.properties.name === selectedCountry) ?? null,
    [countries, selectedCountry],
  )
  const markers = useMemo(() => {
    if (!snapshot) return []
    return snapshot.markers.filter((marker) => {
      if (region !== "world" && marker.region !== region) return false
      if (!layers.includes(eventType(marker.kind, marker.title))) return false
      if (selectedFeature && !featureContains(selectedFeature, marker.lon, marker.lat)) return false
      return true
    })
  }, [snapshot, region, layers, selectedFeature])
  const stories = useMemo(() => {
    if (!snapshot) return []
    if (!selectedFeature) return snapshot.headlines
    return snapshot.headlines.filter((item) => {
      if (item.lat != null && item.lon != null && featureContains(selectedFeature, item.lon, item.lat)) return true
      return mentionsCountry(item.title, selectedFeature)
    })
  }, [snapshot, selectedFeature])

  const counts = useMemo(() => {
    const tally: Record<string, number> = {}
    for (const id of REGION_IDS) tally[id] = 0
    if (!snapshot) return tally
    tally.world = snapshot.markers.length
    for (const marker of snapshot.markers) tally[marker.region] += 1
    return tally
  }, [snapshot])

  const toasts = (snapshot?.signals ?? []).filter(
    (signal) => (signal.tier === "FLASH" || signal.tier === "PRIORITY") && !dismissed.includes(signal.id),
  ).slice(0, 3)

  function chooseCountry(name: string) {
    if (selectedCountry === name) {
      setSelectedCountry(null)
      return
    }
    setSelectedCountry(name)
    const feature = countries.find((item) => item.properties.name === name)
    if (feature) setFocus({ lat: feature.properties.lat, lon: feature.properties.lon, token: Date.now() })
  }

  function openStory(item: (typeof stories)[number]) {
    setDetail(headlineDetail(item))
    if (item.lat != null && item.lon != null) setFocus({ lat: item.lat, lon: item.lon, token: Date.now() })
  }

  function openMarker(marker: Marker) {
    setDetail(markerDetail(marker))
    setFocus({ lat: marker.lat, lon: marker.lon, token: Date.now() })
    setView("board")
  }

  function setVisualMode(next: "full" | "lite") {
    setVisuals(next)
    window.localStorage.setItem("worldmeter-visuals", next)
    if (next === "lite") setMode("flat")
  }

  return (
    <div className={visuals === "lite" ? "shell lite" : "shell"}>
      <a className="skip" href="#board">Skip to the board</a>
      <header className="top">
        <div className="brand">
          <h1>Worldmeter</h1>
          <p>{snapshot ? `Swept ${age(snapshot.generatedAt)} · every ${snapshot.sweepMinutes} minutes` : "Public feeds, swept every 30 minutes"}</p>
        </div>
        <div className="regions" role="group" aria-label="Region">
          {REGION_IDS.map((id) => (
            <button
              key={id}
              id={`region-${id}`}
              className="btn"
              aria-pressed={region === id}
              onClick={() => setRegion(id)}
            >
              {REGION_LABELS[id]}{snapshot ? ` ${counts[id] ?? 0}` : ""}
            </button>
          ))}
        </div>
        <div className="actions">
          <div role="group" aria-label="Map style">
            <button className="btn" aria-pressed={mode === "flat"} onClick={() => setMode("flat")}>Flat map</button>
            <button className="btn" aria-pressed={mode === "globe"} onClick={() => setMode("globe")}>3D globe</button>
          </div>
          <div role="group" aria-label="Motion">
            <button className="btn" aria-pressed={visuals === "full"} onClick={() => setVisualMode("full")}>Full</button>
            <button className="btn" aria-pressed={visuals === "lite"} onClick={() => setVisualMode("lite")}>Lite</button>
          </div>
          <button className="btn primary" aria-expanded={panel === "sources"} onClick={() => setPanel(panel === "sources" ? null : "sources")}>Sources</button>
          <button className="btn primary" aria-expanded={panel === "signals"} onClick={() => setPanel(panel === "signals" ? null : "signals")}>Signals</button>
        </div>
      </header>

      <div className="ticker-wrap">
        <div className="ticker" role="region" aria-label="News headlines">
          {stories.length > 0 ? (
            <div className={tickerPaused || visuals === "lite" ? "ticker-track paused" : "ticker-track"}>
              {[...stories.slice(0, 36), ...stories.slice(0, 36)].map((item, index) => (
                <button
                  key={`${item.url}-${index}`}
                  type="button"
                  className="ticker-item"
                  onClick={() => openStory(item)}
                >
                  <strong>{item.source}</strong> {item.title}
                </button>
              ))}
            </div>
          ) : (
            <p className="meta" style={{ margin: "0 1rem" }}>No headlines in this sweep.</p>
          )}
        </div>
        <button
          className="btn"
          aria-pressed={tickerPaused}
          aria-label={tickerPaused ? "Resume headlines" : "Pause headlines"}
          onClick={() => setTickerPaused((value) => !value)}
        >
          {tickerPaused ? "Resume" : "Pause"}
        </button>
      </div>

      <nav className="views" aria-label="Board views">
        {VIEWS.map((item) => (
          <button key={item.id} type="button" className="btn" aria-pressed={view === item.id} onClick={() => setView(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>

      {error && (
        <div className="banner error" role="alert">
          <strong>The board could not refresh.</strong> {error}
        </div>
      )}
      {!data && !error && (
        <div className="banner" role="status">Collecting the first sweep. Keyed sources stay quiet until a secret is set.</div>
      )}
      {data && !data.ready && !error && <div className="banner" role="status">{data.message}</div>}

      {toasts.length > 0 && (
        <div className="toasts" aria-live="polite">
          {toasts.map((toast) => (
            <article key={toast.id} className={toast.tier === "FLASH" ? "toast flash" : "toast"} role="status">
              <header>
                <span className="tier">{toast.tier}</span>
                <button className="btn" aria-label={`Dismiss alert: ${toast.title}`} onClick={() => setDismissed((current) => [...current, toast.id])}>Dismiss</button>
              </header>
              <button type="button" className="row-btn" onClick={() => {
                setDetail(signalDetail(toast))
                if (toast.lat != null && toast.lon != null) {
                  setFocus({ lat: toast.lat, lon: toast.lon, token: Date.now() })
                  setView("board")
                }
              }}>
                <strong>{toast.title}</strong>
                <span>{toast.detail}</span>
              </button>
            </article>
          ))}
        </div>
      )}

      {view === "board" && (
        <main id="board" className="layout">
          <section className="panel" aria-labelledby="gauges-heading">
            <h2 id="gauges-heading">Risk gauges</h2>
            {(snapshot?.gauges ?? []).map((gauge) => (
              <article key={gauge.id} id={cardId(gauge.id)} className="gauge" aria-labelledby={`${gauge.id}-label`}>
                <header>
                  <h3 id={`${gauge.id}-label`}>{gauge.label}</h3>
                  <span>{gauge.valueLabel}</span>
                </header>
                <div className="bar" aria-hidden="true">
                  <i style={{ width: `${gauge.score ?? 0}%` }} />
                </div>
                <p className="formula">{gauge.formula}</p>
              </article>
            ))}
            {!snapshot && <p className="meta">Gauges appear after the sweep returns a VIX level, the Treasury spread, GSCPI, high-yield OAS, and the USGS count.</p>}
            {snapshot?.delta && <p className="meta">{snapshot.delta.headline}</p>}
          </section>

          <section className="stage" aria-label="Map">
            {selectedCountry && (
              <p className="country-banner">
                <span data-testid="selected-country">{selectedCountry}</span>
                <button type="button" className="btn" onClick={() => setSelectedCountry(null)}>Clear country</button>
              </p>
            )}
            <div className="map-frame">
              {mode === "globe" ? (
                <Suspense fallback={<p className="meta" style={{ padding: "1rem" }}>Loading the globe…</p>}>
                  <GlobePanel
                    markers={markers}
                    countries={countries}
                    selectedCountry={selectedCountry}
                    paused={globePaused || visuals === "lite"}
                    focus={focus}
                    onPick={openMarker}
                    onCountry={chooseCountry}
                  />
                </Suspense>
              ) : (
                <Suspense fallback={<p className="meta" style={{ padding: "1rem" }}>Loading the map…</p>}>
                  <FlatMap
                    markers={markers}
                    countries={countries}
                    selectedCountry={selectedCountry}
                    focus={focus}
                    onPick={openMarker}
                    onCountry={chooseCountry}
                  />
                </Suspense>
              )}
            </div>
            <p className="meta map-hint">
              {mode === "globe"
                ? "Drag to rotate. Scroll or pinch to zoom. Rotation pauses while you interact. Click a country to filter the lists."
                : "Drag to pan. Scroll or pinch to zoom. Click a country to filter the lists. A numbered circle is a cluster."}
            </p>
            <Legend
              active={layers}
              onToggle={(id) => setLayers((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}
            />
            <div className="legend">
              <span>{markers.length} markers in view</span>
              {mode === "globe" && (
                <button className="btn" aria-pressed={globePaused} aria-label={globePaused ? "Resume globe rotation" : "Pause globe rotation"} onClick={() => setGlobePaused((value) => !value)}>
                  {globePaused ? "Resume rotation" : "Pause rotation"}
                </button>
              )}
            </div>
            <ul className="sr">
              {markers.slice(0, 40).map((marker) => (
                <li key={marker.id}>
                  <button type="button" onClick={() => openMarker(marker)}>{marker.region}: {marker.title}. {marker.detail}</button>
                </li>
              ))}
            </ul>
            {snapshot && <p className="meta" id={cardId("eonet")}>{snapshot.eonetLabel}</p>}
            {detail && snapshot && <DetailCard item={detail} sweepAt={snapshot.generatedAt} onClose={() => setDetail(null)} />}
          </section>

          <aside className="panel" aria-labelledby="markets-heading">
            <h2 id="markets-heading">Markets</h2>
            <p className="meta">Change versus the prior session close.</p>
            {(snapshot?.markets ?? []).map((quote) => (
              <button
                key={quote.symbol}
                type="button"
                id={cardId(quote.symbol.replace(/[^a-z0-9]+/gi, "").toLowerCase())}
                className="market row-btn"
                onClick={() => snapshot && setDetail({
                  id: quote.symbol,
                  title: quote.label,
                  kind: "Market",
                  detail: `Last ${quote.price.toLocaleString("en-US")} against prior session close ${quote.priorClose.toLocaleString("en-US")}.`,
                  url: yahooQuoteUrl(quote.symbol),
                  lat: null,
                  lon: null,
                  observedAt: null,
                  figures: formatChange(quote.changePct),
                  severity: null,
                })}
              >
                <div>
                  <strong>{quote.label}</strong>
                  <div className="meta">{quote.price.toLocaleString("en-US")}</div>
                </div>
                <div className={quote.changePct > 0.05 ? "up" : quote.changePct < -0.05 ? "down" : "flat"}>
                  {formatChange(quote.changePct)}
                </div>
              </button>
            ))}
            <div className="stats">
              {snapshot?.debt && (
                <p className="stat" id={cardId("public-debt")}><strong>${snapshot.debt.trillions.toFixed(2)}T</strong> US public debt, {snapshot.debt.asOf}</p>
              )}
              {snapshot?.unemployment && (
                <p className="stat" id={cardId("unemployment")}><strong>{snapshot.unemployment.rate.toFixed(1)}%</strong> US unemployment, {snapshot.unemployment.asOf}</p>
              )}
              {snapshot && snapshot.fx.length > 0 && (
                <p className="stat" id={cardId("fx")}>{snapshot.fx.map((rate) => `${rate.pair} ${rate.rate.toFixed(2)}`).join(" · ")}</p>
              )}
            </div>
            {snapshot && <WireList headlines={stories} onOpen={openStory} />}
          </aside>
        </main>
      )}

      {snapshot && view !== "board" && (
        <main id="board" className="view-wrap">
          {view === "news" && <NewsPanel headlines={stories} onOpen={openStory} />}
          {view === "sensors" && <SensorGrid snapshot={snapshot} onOpen={openMarker} />}
          {view === "nuclear" && <NuclearWatch snapshot={snapshot} onOpen={openMarker} />}
          {view === "space" && <SpaceWatch snapshot={snapshot} onOpen={openMarker} />}
          {view === "macro" && (
            <MacroPanel
              snapshot={snapshot}
              onQuote={(symbol) => {
                const quote = snapshot.markets.find((item) => item.symbol === symbol)
                if (!quote) return
                setDetail({
                  id: quote.symbol,
                  title: quote.label,
                  kind: "Market",
                  detail: `Last ${quote.price.toLocaleString("en-US")} against prior session close ${quote.priorClose.toLocaleString("en-US")}.`,
                  url: yahooQuoteUrl(quote.symbol),
                  lat: null,
                  lon: null,
                  observedAt: null,
                  figures: formatChange(quote.changePct),
                  severity: null,
                })
              }}
              onMacro={(id) => {
                const figure = snapshot.macro.find((item) => item.id === id)
                if (!figure) return
                setDetail({
                  id: figure.id,
                  title: figure.label,
                  kind: "Macro",
                  detail: `Latest public FRED observation, ${figure.asOf}.`,
                  url: figure.url,
                  lat: null,
                  lon: null,
                  observedAt: figure.asOf,
                  figures: figure.value,
                  severity: null,
                })
              }}
            />
          )}
          {view === "delta" && <DeltaPanel snapshot={snapshot} />}
          {view === "glossary" && <Glossary />}
          {detail && <DetailCard item={detail} sweepAt={snapshot.generatedAt} onClose={() => setDetail(null)} />}
        </main>
      )}

      {!snapshot && view !== "board" && (
        <main id="board" className="view-wrap">
          <p className="banner">This view fills in when the sweep returns.</p>
        </main>
      )}

      <footer className="foot" id="source">
        <p>
          Worldmeter is a derivative of <a href="https://github.com/calesthio/Crucix">Crucix</a> by calesthio, licensed under the GNU AGPL v3.
          Feeds are fetched on the server every 30 minutes.
        </p>
        <a href={snapshot?.sourceRepoUrl || "#source"}>Source code</a>
      </footer>
      {snapshot && !snapshot.sourceRepoUrl && (
        <p className="meta" style={{ padding: "0 1rem 1rem" }}>
          This deployment has not set SOURCE_REPO_URL yet. AGPL requires offering this program’s source to people who use it over the network. Upstream source is https://github.com/calesthio/Crucix.
        </p>
      )}

      {panel && snapshot && (
        <>
          <div className="backdrop" onClick={() => setPanel(null)} />
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="panel-title">
            <header style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
              <h2 id="panel-title">{panel === "sources" ? "Sources" : "Signals"}</h2>
              <button className="btn" onClick={() => setPanel(null)}>Close</button>
            </header>
            {panel === "sources" ? (
              snapshot.sources.map((source) => (
                <article key={source.id} id={cardId(`source-${source.id}`)} className="source">
                  <h3>{source.label} <span className={`pill ${source.status}`}>{STATUS_TEXT[source.status]}</span></h3>
                  <p className="meta">{source.tier}. {source.description}</p>
                  <p className="meta">
                    This attempt: {source.itemCount} items
                    {source.fetchedAt ? ` · fetched ${source.fetchedAt.slice(11, 16)} UTC` : ""}
                    {source.lastSuccess ? ` · last success ${source.lastSuccess.slice(11, 16)} UTC (${source.lastSuccessCount ?? 0})` : ""}
                  </p>
                  {source.detail && <p>{source.detail}</p>}
                  {source.error && <p>{source.error}</p>}
                </article>
              ))
            ) : snapshot.signals.length === 0 ? (
              <p>No cross-checks fired on this sweep.</p>
            ) : (
              snapshot.signals.map((signal) => (
                <button key={signal.id} type="button" className="signal row-btn" onClick={() => {
                  setDetail(signalDetail(signal))
                  setPanel(null)
                  if (signal.lat != null && signal.lon != null) {
                    setFocus({ lat: signal.lat, lon: signal.lon, token: Date.now() })
                    setView("board")
                  }
                }}>
                  <strong>{signal.tier === "INFO" ? "Note" : signal.tier}. {signal.title}</strong>
                  <span className="meta">{signal.detail}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

function age(iso: string): string {
  const delta = Date.now() - Date.parse(iso)
  if (!Number.isFinite(delta) || delta < 0) return "just now"
  const minutes = Math.round(delta / 60000)
  if (minutes < 1) return "just now"
  if (minutes === 1) return "1 minute ago"
  return `${minutes} minutes ago`
}
