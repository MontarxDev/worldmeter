import { useEffect, useRef, useState } from "react"
import { focusAngles, projectMarker, unproject } from "../logic/globe"
import type { Marker } from "../logic/markers"
import { REGION_FOCUS, type RegionId } from "../logic/regions"

const PIN_COLOR: Record<Marker["severity"], string> = {
  flash: "#ff6b5a",
  priority: "#f0b429",
  routine: "#c6f56b",
  info: "#9fd7ff",
}

export type MapFocus = { lat: number; lon: number; token: number }

export function GlobePanel({
  markers,
  region,
  paused,
  focus,
  onPick,
}: {
  markers: Marker[]
  region: RegionId
  paused: boolean
  focus: MapFocus | null
  onPick: (marker: Marker) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phiRef = useRef(0.4)
  const thetaRef = useRef(0.25)
  const scaleRef = useRef(1)
  const pausedRef = useRef(paused)
  const regionRef = useRef(region)
  const markersRef = useRef(markers)
  const holdRef = useRef(false)
  const movedRef = useRef(false)
  const reduceRef = useRef(false)
  const targetRef = useRef<{ phi: number; theta: number } | null>(null)
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>())
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick
  const [tip, setTip] = useState<{ x: number; y: number; title: string; detail: string } | null>(null)

  pausedRef.current = paused
  regionRef.current = region
  markersRef.current = markers

  useEffect(() => {
    reduceRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  }, [])

  useEffect(() => {
    if (region === "world") return
    const spot = REGION_FOCUS[region]
    targetRef.current = focusAngles(spot.lat, spot.lon)
  }, [region])

  useEffect(() => {
    if (!focus) return
    targetRef.current = focusAngles(focus.lat, focus.lon)
    holdRef.current = true
    const timer = window.setTimeout(() => {
      holdRef.current = false
    }, 2500)
    return () => window.clearTimeout(timer)
  }, [focus])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let globe: { destroy: () => void } | undefined
    let alive = true
    let frame = 0
    let onResize: (() => void) | undefined

    const placePins = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (width < 2 || height < 2) return
      const target = targetRef.current
      if (target) {
        phiRef.current = lerpAngle(phiRef.current, target.phi, 0.16)
        thetaRef.current += (target.theta - thetaRef.current) * 0.16
        if (angleDistance(phiRef.current, target.phi) < 0.02 && Math.abs(thetaRef.current - target.theta) < 0.02) {
          phiRef.current = target.phi
          thetaRef.current = target.theta
          targetRef.current = null
        }
      } else if (!pausedRef.current && !holdRef.current && regionRef.current === "world" && !reduceRef.current) {
        phiRef.current += 0.0025
      }
      for (const marker of markersRef.current) {
        const el = buttonRefs.current.get(marker.id)
        if (!el) continue
        const point = projectMarker(
          marker.lat,
          marker.lon,
          phiRef.current,
          thetaRef.current,
          scaleRef.current,
          width,
          height,
        )
        el.style.visibility = point.visible ? "visible" : "hidden"
        el.style.left = `${point.x}px`
        el.style.top = `${point.y}px`
      }
    }

    void import("cobe").then(({ default: createGlobe }) => {
      if (!alive) return
      const paint = () => {
        const width = Math.max(Math.round(canvas.clientWidth || 320), 280)
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
        globe?.destroy()
        globe = createGlobe(canvas, {
          devicePixelRatio: dpr,
          width: width * dpr,
          height: width * dpr,
          phi: phiRef.current,
          theta: thetaRef.current,
          scale: scaleRef.current,
          dark: 0.9,
          diffuse: 1.5,
          mapSamples: 16000,
          mapBrightness: 8,
          mapBaseBrightness: 0.18,
          baseColor: [0.42, 0.58, 0.46],
          markerColor: [1, 0.78, 0.28],
          glowColor: [0.28, 0.45, 0.34],
          markers: [],
          onRender: (state) => {
            state.phi = phiRef.current
            state.theta = thetaRef.current
            state.scale = scaleRef.current
          },
        })
      }
      paint()
      onResize = () => paint()
      window.addEventListener("resize", onResize)
    })

    const tick = () => {
      placePins()
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)

    return () => {
      alive = false
      window.cancelAnimationFrame(frame)
      if (onResize) window.removeEventListener("resize", onResize)
      globe?.destroy()
    }
  }, [])

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const pointers = new Map<number, { x: number; y: number }>()
    let drag: { x: number; y: number; phi: number; theta: number } | null = null
    let pinch: { distance: number; scale: number } | null = null
    let idle = 0

    const hold = () => {
      holdRef.current = true
      window.clearTimeout(idle)
      idle = window.setTimeout(() => {
        holdRef.current = false
      }, 2500)
    }

    const local = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return { x: event.clientX - rect.left, y: event.clientY - rect.top, rect }
    }

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType === "mouse") return
      wrap.setPointerCapture(event.pointerId)
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      targetRef.current = null
      hold()
      movedRef.current = false
      if (pointers.size === 1) {
        drag = { x: event.clientX, y: event.clientY, phi: phiRef.current, theta: thetaRef.current }
        pinch = null
      } else if (pointers.size === 2) {
        drag = null
        const [a, b] = [...pointers.values()]
        pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: scaleRef.current }
      }
    }

    const onMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.size >= 2 && pinch) {
        const [a, b] = [...pointers.values()]
        const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1
        scaleRef.current = clamp(pinch.scale * (distance / pinch.distance), 0.7, 2.2)
        movedRef.current = true
        return
      }
      if (!drag) return
      const dx = event.clientX - drag.x
      const dy = event.clientY - drag.y
      if (Math.hypot(dx, dy) > 4) movedRef.current = true
      phiRef.current = drag.phi - dx * 0.005
      thetaRef.current = clamp(drag.theta + dy * 0.005, -1.2, 1.2)
    }

    const onUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId)
      if (pointers.size < 2) pinch = null
      if (pointers.size === 0 && drag && !movedRef.current) {
        const point = local(event)
        const hit = nearestMarker(point.x, point.y, canvas.clientWidth, canvas.clientHeight)
        if (hit) onPickRef.current(hit)
      }
      if (pointers.size === 0) drag = null
      hold()
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const factor = event.deltaY > 0 ? 0.92 : 1.08
      scaleRef.current = clamp(scaleRef.current * factor, 0.7, 2.2)
      hold()
    }

    wrap.addEventListener("pointerdown", onDown)
    wrap.addEventListener("pointermove", onMove)
    wrap.addEventListener("pointerup", onUp)
    wrap.addEventListener("pointercancel", onUp)
    wrap.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      window.clearTimeout(idle)
      wrap.removeEventListener("pointerdown", onDown)
      wrap.removeEventListener("pointermove", onMove)
      wrap.removeEventListener("pointerup", onUp)
      wrap.removeEventListener("pointercancel", onUp)
      wrap.removeEventListener("wheel", onWheel)
    }
  }, [])

  function nearestMarker(x: number, y: number, width: number, height: number): Marker | null {
    const hit = unproject(x, y, phiRef.current, thetaRef.current, scaleRef.current, width, height)
    let best: Marker | null = null
    let bestPx = 36
    for (const marker of markersRef.current) {
      const point = projectMarker(marker.lat, marker.lon, phiRef.current, thetaRef.current, scaleRef.current, width, height)
      if (!point.visible) continue
      const px = Math.hypot(point.x - x, point.y - y)
      if (px < bestPx) {
        bestPx = px
        best = marker
      }
    }
    if (best || !hit) return best
    return null
  }

  return (
    <div ref={wrapRef} className="globe-wrap">
      <canvas ref={canvasRef} className="globe-canvas" aria-label="3D globe. Drag to rotate, scroll or pinch to zoom." />
      <div className="pin-layer">
        {markers.map((marker) => (
          <button
            key={marker.id}
            type="button"
            className={`pin pin-${marker.severity}`}
            style={{ background: PIN_COLOR[marker.severity] }}
            aria-label={`${marker.kind}: ${marker.title}`}
            ref={(node) => {
              if (node) buttonRefs.current.set(marker.id, node)
              else buttonRefs.current.delete(marker.id)
            }}
            onClick={(event) => {
              event.stopPropagation()
              if (movedRef.current) return
              onPickRef.current(marker)
            }}
            onPointerEnter={(event) => {
              const rect = wrapRef.current?.getBoundingClientRect()
              if (!rect) return
              setTip({
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
                title: marker.title,
                detail: marker.detail,
              })
            }}
            onPointerLeave={() => setTip(null)}
          />
        ))}
      </div>
      {tip && (
        <div className="tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
          <strong>{tip.title}</strong>
          <span>{tip.detail}</span>
        </div>
      )}
    </div>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function lerpAngle(from: number, to: number, t: number): number {
  let delta = to - from
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  return from + delta * t
}

function angleDistance(a: number, b: number): number {
  let delta = a - b
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  return Math.abs(delta)
}
