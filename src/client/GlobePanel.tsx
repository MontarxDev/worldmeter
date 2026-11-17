import { useEffect, useRef } from "react"
import type { GlobeInstance } from "globe.gl"
import type { CountryFeature } from "../logic/geo"
import type { Marker } from "../logic/markers"
import { clusterMarkers, globeZoom } from "./cluster"
import { clusterElement, markerElement } from "./icons"
import type { MapFocus } from "./map-types"

export function GlobePanel({
  markers,
  countries,
  selectedCountry,
  paused,
  focus,
  onPick,
  onCountry,
}: {
  markers: Marker[]
  countries: CountryFeature[]
  selectedCountry: string | null
  paused: boolean
  focus: MapFocus | null
  onPick: (marker: Marker) => void
  onCountry: (name: string) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<GlobeInstance | null>(null)
  const markersRef = useRef(markers)
  const countriesRef = useRef(countries)
  const selectedRef = useRef(selectedCountry)
  const pausedRef = useRef(paused)
  const onPickRef = useRef(onPick)
  const onCountryRef = useRef(onCountry)
  const zoomRef = useRef(2)
  markersRef.current = markers
  countriesRef.current = countries
  selectedRef.current = selectedCountry
  pausedRef.current = paused
  onPickRef.current = onPick
  onCountryRef.current = onCountry

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    let globe: GlobeInstance | null = null
    let alive = true
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let idle = 0

    const paintMarkers = () => {
      if (!globe) return
      const items = clusterMarkers(markersRef.current, zoomRef.current)
      globe.htmlElementsData(items)
    }

    const paintCountries = () => {
      if (!globe) return
      const selected = selectedRef.current
      globe
        .polygonsData(countriesRef.current)
        .polygonCapColor((feature: object) => {
          const name = (feature as CountryFeature).properties?.name
          if (selected && name === selected) return "rgba(240, 180, 41, 0.72)"
          return selected ? "rgba(28, 61, 44, 0.45)" : "rgba(46, 92, 68, 0.38)"
        })
        .polygonStrokeColor(() => "rgba(197, 210, 190, 0.85)")
    }

    void import("globe.gl").then(({ default: Globe }) => {
      if (!alive) return
      globe = new Globe(wrap, { animateIn: false })
      globeRef.current = globe
      window.__worldmeterGlobe = globe
      const width = wrap.clientWidth || 640
      const height = wrap.clientHeight || 480
      globe
        .width(width)
        .height(height)
        .backgroundColor("#0b100e")
        .globeImageUrl("/earth-day.jpg")
        .showAtmosphere(true)
        .atmosphereColor("#8faf86")
        .atmosphereAltitude(0.18)
        .polygonAltitude(0.007)
        .polygonCapCurvatureResolution(2)
        .polygonsTransitionDuration(0)
        .htmlTransitionDuration(0)
        .htmlLat((item: object) => (item as { lat: number }).lat)
        .htmlLng((item: object) => (item as { lng: number }).lng)
        .htmlAltitude(0.01)
        .htmlElement((item: object) => {
          const point = item as { kind: string; marker?: Marker; count?: number; lat: number; lng: number; expansionZoom?: number }
          if (point.kind === "cluster") {
            return clusterElement(point.count ?? 0, () => {
              globe?.pointOfView({ lat: point.lat, lng: point.lng, altitude: 0.7 }, 600)
            })
          }
          return markerElement(point.marker as Marker, (marker) => onPickRef.current(marker))
        })
        .onPolygonClick((polygon: object) => {
          const name = (polygon as CountryFeature).properties?.name
          if (name) onCountryRef.current(name)
        })
        .onZoom((pov) => {
          const next = globeZoom(pov.altitude)
          if (next !== zoomRef.current) {
            zoomRef.current = next
            paintMarkers()
          }
        })
      paintCountries()
      paintMarkers()
      const controls = globe.controls()
      controls.autoRotate = !pausedRef.current && !reduce
      controls.autoRotateSpeed = 0.45
      const hold = () => {
        controls.autoRotate = false
        window.clearTimeout(idle)
        idle = window.setTimeout(() => {
          controls.autoRotate = !pausedRef.current && !reduce && !selectedRef.current
        }, 2500)
      }
      wrap.addEventListener("pointerdown", hold)
      wrap.addEventListener("wheel", hold, { passive: true })
    })

    const onResize = () => {
      if (!globeRef.current || !wrap) return
      globeRef.current.width(wrap.clientWidth).height(wrap.clientHeight)
    }
    const observer = new ResizeObserver(onResize)
    observer.observe(wrap)
    return () => {
      alive = false
      window.clearTimeout(idle)
      observer.disconnect()
      globe?._destructor()
      globeRef.current = null
      if (window.__worldmeterGlobe === globe) delete window.__worldmeterGlobe
    }
  }, [])

  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return
    const selected = selectedCountry
    globe
      .polygonsData(countries)
      .polygonCapColor((feature: object) => {
        const name = (feature as CountryFeature).properties?.name
        if (selected && name === selected) return "rgba(240, 180, 41, 0.72)"
        return selected ? "rgba(28, 61, 44, 0.45)" : "rgba(46, 92, 68, 0.38)"
      })
    globe.htmlElementsData(clusterMarkers(markers, zoomRef.current))
  }, [markers, countries, selectedCountry])

  useEffect(() => {
    const controls = globeRef.current?.controls()
    if (!controls) return
    if (paused) controls.autoRotate = false
  }, [paused])

  useEffect(() => {
    if (!focus || !globeRef.current) return
    globeRef.current.pointOfView({ lat: focus.lat, lng: focus.lon, altitude: 1.15 }, 700)
    globeRef.current.controls().autoRotate = false
  }, [focus])

  return <div ref={wrapRef} className="globe-wrap" data-testid="globe" />
}
