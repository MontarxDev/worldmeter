import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import type { Snapshot } from "../logic/assemble"
import { cardId, REGION_IDS, REGION_LABELS, type RegionId } from "../logic/regions"
import { formatChange } from "../logic/markets"
import { FlatMap } from "./FlatMap"

const GlobePanel = lazy(() => import("./GlobePanel").then((mod) => ({ default: mod.GlobePanel })))

type Pending = { ready: false; message: string }
type Payload = Snapshot | Pending

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
  const [dismissed, setDismissed] = useState<string[]>([])

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 960px)").matches
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (wide && !reduce) {
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
    if (!panel) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanel(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [panel])

  const snapshot = data && data.ready ? data : null
  const markers = useMemo(() => {
    if (!snapshot) return []
    if (region === "world") return snapshot.markers
    return snapshot.markers.filter((marker) => marker.region === region)
  }, [snapshot, region])

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

  return (
    <div className="shell">
      <a className="skip" href="#board">Skip to the board</a>
      <header className="top">
        <div className="brand">
          <h1>Worldmeter</h1>
          <p>{snapshot ? `Swept ${age(snapshot.generatedAt)} · every ${snapshot.sweepMinutes} minutes` : "Public feeds, swept every 2 minutes"}</p>
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
          <button className="btn primary" aria-expanded={panel === "sources"} onClick={() => setPanel(panel === "sources" ? null : "sources")}>Sources</button>
          <button className="btn primary" aria-expanded={panel === "signals"} onClick={() => setPanel(panel === "signals" ? null : "signals")}>Signals</button>
        </div>
      </header>

      <div className="ticker-wrap">
        <div className="ticker" role="region" aria-label="News headlines">
          {snapshot && snapshot.headlines.length > 0 ? (
            <div className={tickerPaused ? "ticker-track paused" : "ticker-track"}>
              {[...snapshot.headlines, ...snapshot.headlines].map((item, index) => (
                <a key={`${item.title}-${index}`} className="ticker-item" href={item.url}>
                  <strong>{item.source}</strong> {item.title}
                </a>
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
              <p><strong>{toast.title}</strong></p>
              <p>{toast.detail}</p>
            </article>
          ))}
        </div>
      )}

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
        </section>

        <section className="stage" aria-label="Map">
          <div className="map-frame">
            {mode === "globe" ? (
              <Suspense fallback={<p className="meta" style={{ padding: "1rem" }}>Loading the globe…</p>}>
                <GlobePanel markers={markers} region={region} paused={globePaused} />
              </Suspense>
            ) : (
              <FlatMap markers={markers} />
            )}
          </div>
          <div className="legend">
            <span>{markers.length} markers in view</span>
            <span>Amber marks priority, blue marks the rest</span>
            {mode === "globe" && (
              <button className="btn" aria-pressed={globePaused} aria-label={globePaused ? "Resume globe rotation" : "Pause globe rotation"} onClick={() => setGlobePaused((value) => !value)}>
                {globePaused ? "Resume rotation" : "Pause rotation"}
              </button>
            )}
          </div>
          <ul className="sr">
            {markers.slice(0, 40).map((marker) => (
              <li key={marker.id}>{marker.region}: {marker.title}. {marker.detail}</li>
            ))}
          </ul>
          {snapshot && (
            <p className="meta" id={cardId("eonet")}>{snapshot.eonetLabel}</p>
          )}
        </section>

        <aside className="panel" aria-labelledby="markets-heading">
          <h2 id="markets-heading">Markets</h2>
          <p className="meta">Change versus the prior session close.</p>
          {(snapshot?.markets ?? []).map((quote) => (
            <div key={quote.symbol} id={cardId(quote.symbol.replace(/[^a-z0-9]+/gi, "").toLowerCase())} className="market">
              <div>
                <strong>{quote.label}</strong>
                <div className="meta">{quote.price.toLocaleString("en-US")}</div>
              </div>
              <div className={quote.changePct > 0.05 ? "up" : quote.changePct < -0.05 ? "down" : "flat"}>
                {formatChange(quote.changePct)}
              </div>
            </div>
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
        </aside>
      </main>

      <footer className="foot" id="source">
        <p>
          Worldmeter is a derivative of <a href="https://github.com/calesthio/Crucix">Crucix</a> by calesthio, licensed under the GNU AGPL v3.
          Feeds are fetched on the server every 2 minutes.
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
                <article key={signal.id} className="signal">
                  <h3>{signal.tier === "INFO" ? "Note" : signal.tier}. {signal.title}</h3>
                  <p className="meta">{signal.detail}</p>
                </article>
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
