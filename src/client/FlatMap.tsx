import { useEffect, useRef } from "react"
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl"
import type { FeatureCollection } from "geojson"
import type { CountryFeature } from "../logic/geo"
import type { Marker } from "../logic/markers"
import { clusterMarkers } from "./cluster"
import { clusterElement, markerElement } from "./icons"
import type { MapFocus } from "./map-types"

export function FlatMap({
  markers,
  countries,
  selectedCountry,
  focus,
  onPick,
  onCountry,
}: {
  markers: Marker[]
  countries: CountryFeature[]
  selectedCountry: string | null
  focus: MapFocus | null
  onPick: (marker: Marker) => void
  onCountry: (name: string) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const pinsRef = useRef<{ remove: () => void }[]>([])
  const markersRef = useRef(markers)
  const countriesRef = useRef(countries)
  const selectedRef = useRef(selectedCountry)
  const onPickRef = useRef(onPick)
  const onCountryRef = useRef(onCountry)
  markersRef.current = markers
  countriesRef.current = countries
  selectedRef.current = selectedCountry
  onPickRef.current = onPick
  onCountryRef.current = onCountry

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    let map: MapLibreMap | null = null
    let alive = true

    void import("maplibre-gl").then((maplibregl) => {
      if (!document.querySelector("link[data-maplibre]")) {
        const link = document.createElement("link")
        link.rel = "stylesheet"
        link.href = "/maplibre-gl.css"
        link.dataset.maplibre = "1"
        document.head.appendChild(link)
      }
      if (!alive || !wrap) return
      maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs")
      const current = new maplibregl.Map({
        container: wrap,
        attributionControl: false,
        renderWorldCopies: false,
        style: {
          version: 8,
          sources: {},
          layers: [{ id: "background", type: "background", paint: { "background-color": "#101814" } }],
        },
        center: [10, 15],
        zoom: 1.15,
      })
      map = current
      mapRef.current = current
      current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right")

      const placePins = () => {
        for (const pin of pinsRef.current) pin.remove()
        const zoom = Math.round(current.getZoom())
        const items = clusterMarkers(markersRef.current, zoom < 4 ? Math.max(zoom, 0) : 6)
        pinsRef.current = items.map((item) => {
          const element = item.kind === "cluster"
            ? clusterElement(item.count, () => {
                current.easeTo({ center: [item.lng, item.lat], zoom: Math.min(Math.max(item.expansionZoom, current.getZoom() + 1), 6) })
              })
            : markerElement(item.marker, (picked) => onPickRef.current(picked))
          return new maplibregl.Marker({ element, anchor: "center" }).setLngLat([item.lng, item.lat]).addTo(current)
        })
      }

      current.on("load", () => {
        current.addSource("countries", {
          type: "geojson",
          data: collection(countriesRef.current),
        })
        current.addLayer({
          id: "countries-fill",
          type: "fill",
          source: "countries",
          paint: { "fill-color": "#1c3d2c", "fill-opacity": 0.95 },
        })
        current.addLayer({
          id: "countries-line",
          type: "line",
          source: "countries",
          paint: { "line-color": "#9bb896", "line-width": 0.7 },
        })
        paintCountries(current, selectedRef.current)
        current.on("click", "countries-fill", (event) => {
          const name = event.features?.[0]?.properties?.name
          if (typeof name === "string") onCountryRef.current(name)
        })
        current.on("mouseenter", "countries-fill", () => {
          current.getCanvas().style.cursor = "pointer"
        })
        current.on("mouseleave", "countries-fill", () => {
          current.getCanvas().style.cursor = ""
        })
        window.__worldmeterMap = {
          project: (lnglat) => {
            const point = current.project(lnglat)
            return { x: point.x, y: point.y }
          },
          jumpTo: (options) => {
            current.jumpTo(options)
          },
          whenIdle: () => new Promise<void>((resolve) => {
            let settled = false
            const finish = () => {
              if (settled) return
              settled = true
              resolve()
            }
            current.once("idle", finish)
            window.setTimeout(finish, 700)
          }),
          featuresAt: (point: { x: number; y: number }) => current.queryRenderedFeatures([point.x, point.y], { layers: ["countries-fill"] }).map((feature) => feature.properties?.name),
          getContainer: () => current.getContainer(),
        }
        placePins()
      })
      current.on("zoomend", placePins)
    })

    return () => {
      alive = false
      for (const pin of pinsRef.current) pin.remove()
      pinsRef.current = []
      map?.remove()
      mapRef.current = null
      delete window.__worldmeterMap
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded() || !map.getSource("countries")) return
    const source = map.getSource("countries")
    if (source?.type === "geojson") (source as GeoJSONSource).setData(collection(countries))
    paintCountries(map, selectedCountry)
    map.fire("zoomend")
  }, [countries, selectedCountry, markers])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !focus) return
    map.easeTo({ center: [focus.lon, focus.lat], zoom: Math.max(map.getZoom(), 3.2) })
  }, [focus])

  return <div ref={wrapRef} className="flat-wrap" data-testid="flat-map" />
}

function collection(features: CountryFeature[]): FeatureCollection {
  return { type: "FeatureCollection", features: features as FeatureCollection["features"] }
}

function paintCountries(map: MapLibreMap, selected: string | null) {
  if (!map.getLayer("countries-fill")) return
  map.setPaintProperty("countries-fill", "fill-color", [
    "case",
    ["==", ["get", "name"], selected ?? ""],
    "#f0b429",
    "#1c3d2c",
  ])
}
