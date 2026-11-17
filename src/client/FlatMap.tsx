import { useEffect, useRef, useState } from "react"
import { flatProject, flatUnproject } from "../logic/globe"
import type { Marker } from "../logic/markers"
import type { MapFocus } from "./GlobePanel"

const PIN_COLOR: Record<Marker["severity"], string> = {
  flash: "#ff6b5a",
  priority: "#f0b429",
  routine: "#c6f56b",
  info: "#9fd7ff",
}

export function FlatMap({
  markers,
  focus,
  onPick,
}: {
  markers: Marker[]
  focus: MapFocus | null
  onPick: (marker: Marker) => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef({ x: 0, y: 0, scale: 1 })
  const readyRef = useRef(false)
  const markersRef = useRef(markers)
  const movedRef = useRef(false)
  const drawRef = useRef<() => void>(() => {})
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick
  const [tip, setTip] = useState<{ x: number; y: number; title: string; detail: string } | null>(null)
  markersRef.current = markers

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const image = new Image()
    // Equirectangular land mask shipped with cobe (MIT).
    image.src = "/world-land.png"
    image.onload = () => draw()

    const draw = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (width < 2 || height < 2) return
      if (!readyRef.current) {
        viewRef.current = { x: width / 2, y: height / 2, scale: 1 }
        readyRef.current = true
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      const view = viewRef.current
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = "#101814"
      ctx.fillRect(0, 0, width, height)
      const dx = (0 - view.x) * view.scale + width / 2
      const dy = (0 - view.y) * view.scale + height / 2
      const dw = width * view.scale
      const dh = height * view.scale
      if (image.complete && image.naturalWidth > 0) {
        ctx.drawImage(image, dx, dy, dw, dh)
        ctx.globalCompositeOperation = "multiply"
        ctx.fillStyle = "#9bb896"
        ctx.fillRect(dx, dy, dw, dh)
        ctx.globalCompositeOperation = "lighten"
        ctx.fillStyle = "#163028"
        ctx.fillRect(dx, dy, dw, dh)
        ctx.globalCompositeOperation = "source-over"
      } else {
        ctx.strokeStyle = "#314038"
        ctx.strokeRect(dx, dy, dw, dh)
      }
      ctx.strokeStyle = "rgba(197, 210, 222, 0.25)"
      ctx.lineWidth = 1
      for (let lon = -180; lon <= 180; lon += 30) {
        const start = flatProject(0, lon, width, height, view)
        const end = flatProject(80, lon, width, height, view)
        ctx.beginPath()
        ctx.moveTo(start.x, start.y)
        ctx.lineTo(end.x, end.y)
        ctx.stroke()
      }
      for (const marker of markersRef.current) {
        const point = flatProject(marker.lat, marker.lon, width, height, view)
        if (point.x < -8 || point.y < -8 || point.x > width + 8 || point.y > height + 8) continue
        ctx.beginPath()
        ctx.fillStyle = PIN_COLOR[marker.severity]
        ctx.arc(point.x, point.y, marker.severity === "info" ? 4 : 6, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const nearest = (x: number, y: number) => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      let best: Marker | null = null
      let bestPx = 18
      for (const marker of markersRef.current) {
        const point = flatProject(marker.lat, marker.lon, width, height, viewRef.current)
        const px = Math.hypot(point.x - x, point.y - y)
        if (px < bestPx) {
          bestPx = px
          best = marker
        }
      }
      return best
    }

    let drag: { x: number; y: number; viewX: number; viewY: number; pinch: number; scale: number } | null = null
    const pointers = new Map<number, { x: number; y: number }>()

    const onDown = (event: PointerEvent) => {
      canvas.setPointerCapture(event.pointerId)
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      movedRef.current = false
      const [a, b] = [...pointers.values()]
      drag = {
        x: event.clientX,
        y: event.clientY,
        viewX: viewRef.current.x,
        viewY: viewRef.current.y,
        pinch: pointers.size >= 2 && a && b ? Math.hypot(a.x - b.x, a.y - b.y) || 1 : 0,
        scale: viewRef.current.scale,
      }
    }
    const onMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId) || !drag) {
        const rect = canvas.getBoundingClientRect()
        const hit = nearest(event.clientX - rect.left, event.clientY - rect.top)
        setTip(hit
          ? { x: event.clientX - rect.left, y: event.clientY - rect.top, title: hit.title, detail: hit.detail }
          : null)
        return
      }
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()]
        const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1
        const start = drag.pinch || distance
        viewRef.current.scale = clamp(drag.scale * (distance / start), 1, 8)
        movedRef.current = true
        draw()
        return
      }
      const dx = event.clientX - drag.x
      const dy = event.clientY - drag.y
      if (Math.hypot(dx, dy) > 4) movedRef.current = true
      viewRef.current.x = drag.viewX - dx / viewRef.current.scale
      viewRef.current.y = drag.viewY - dy / viewRef.current.scale
      draw()
    }
    const onUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId)
      if (pointers.size === 0 && drag && !movedRef.current) {
        const rect = canvas.getBoundingClientRect()
        const x = event.clientX - rect.left
        const y = event.clientY - rect.top
        const hit = nearest(x, y)
        if (hit) onPickRef.current(hit)
        else {
          const where = flatUnproject(x, y, canvas.clientWidth, canvas.clientHeight, viewRef.current)
          if (where) setTip({ x, y, title: `${where.lat.toFixed(1)}°, ${where.lon.toFixed(1)}°`, detail: "No marker at this point" })
        }
      }
      if (pointers.size === 0) drag = null
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const before = flatUnproject(x, y, canvas.clientWidth, canvas.clientHeight, viewRef.current)
      const next = clamp(viewRef.current.scale * (event.deltaY > 0 ? 0.9 : 1.1), 1, 8)
      viewRef.current.scale = next
      if (before) {
        const width = canvas.clientWidth
        const height = canvas.clientHeight
        const worldX = ((before.lon + 180) / 360) * width
        const worldY = ((90 - before.lat) / 180) * height
        viewRef.current.x = worldX - (x - width / 2) / next
        viewRef.current.y = worldY - (y - height / 2) / next
      }
      draw()
    }

    drawRef.current = draw
    draw()
    const onResize = () => {
      readyRef.current = false
      draw()
    }
    window.addEventListener("resize", onResize)
    canvas.addEventListener("pointerdown", onDown)
    canvas.addEventListener("pointermove", onMove)
    canvas.addEventListener("pointerup", onUp)
    canvas.addEventListener("pointercancel", onUp)
    canvas.addEventListener("pointerleave", () => setTip(null))
    canvas.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      window.removeEventListener("resize", onResize)
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerup", onUp)
      canvas.removeEventListener("pointercancel", onUp)
      canvas.removeEventListener("wheel", onWheel)
    }
  }, [])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !focus || !readyRef.current) return
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    viewRef.current = {
      x: ((focus.lon + 180) / 360) * width,
      y: ((90 - focus.lat) / 180) * height,
      scale: Math.max(viewRef.current.scale, 2.4),
    }
    drawRef.current()
  }, [focus])

  useEffect(() => {
    drawRef.current()
  }, [markers])

  return (
    <div className="flat-wrap">
      <canvas ref={ref} className="flat-canvas" aria-label="Flat world map. Drag to pan, scroll or pinch to zoom." />
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
