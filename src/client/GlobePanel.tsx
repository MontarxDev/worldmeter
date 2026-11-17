import { useEffect, useRef } from "react"
import type { Marker } from "../logic/markers"
import type { RegionId } from "../logic/regions"
import { REGION_PHI } from "../logic/regions"

export function GlobePanel({ markers, region, paused }: { markers: Marker[]; region: RegionId; paused: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pausedRef = useRef(paused)
  const phiRef = useRef(REGION_PHI[region])
  pausedRef.current = paused

  useEffect(() => {
    phiRef.current = REGION_PHI[region]
  }, [region])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let globe: { destroy: () => void } | undefined
    let alive = true
    let onResize: (() => void) | undefined
    const markerPayload = markers.slice(0, 120).map((marker) => ({
      location: [marker.lat, marker.lon] as [number, number],
      size: marker.severity === "flash" ? 0.1 : marker.severity === "priority" ? 0.07 : 0.045,
    }))

    void import("cobe").then(({ default: createGlobe }) => {
      if (!alive) return
      const paint = () => {
        const width = Math.max(Math.round(canvas.clientWidth || canvas.offsetWidth || 440), 280)
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
        globe?.destroy()
        globe = createGlobe(canvas, {
          devicePixelRatio: dpr,
          width: width * dpr,
          height: width * dpr,
          phi: phiRef.current,
          theta: 0.25,
          dark: 0.9,
          diffuse: 1.5,
          mapSamples: 16000,
          mapBrightness: 8,
          mapBaseBrightness: 0.18,
          baseColor: [0.42, 0.58, 0.46],
          markerColor: [1, 0.78, 0.28],
          glowColor: [0.28, 0.45, 0.34],
          markers: markerPayload,
          onRender: (state) => {
            state.phi = phiRef.current
            if (!pausedRef.current && region === "world") phiRef.current += 0.0025
          },
        })
      }
      paint()
      onResize = () => paint()
      window.addEventListener("resize", onResize)
    })

    return () => {
      alive = false
      if (onResize) window.removeEventListener("resize", onResize)
      globe?.destroy()
    }
  }, [markers, region])

  return <canvas ref={canvasRef} className="globe-canvas" role="img" aria-label="3D globe with event markers" />
}
