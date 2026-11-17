import { useEffect, useRef } from "react"
import type { Marker } from "../logic/markers"

export function FlatMap({ markers }: { markers: Marker[] }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const draw = () => {
      const width = canvas.clientWidth || 640
      const height = Math.max(280, Math.round(width * 0.56))
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = "#101814"
      ctx.fillRect(0, 0, width, height)
      ctx.strokeStyle = "#314038"
      ctx.lineWidth = 1
      for (let lon = -180; lon <= 180; lon += 30) {
        const x = ((lon + 180) / 360) * width
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }
      for (let lat = -60; lat <= 60; lat += 30) {
        const y = ((90 - lat) / 180) * height
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }
      ctx.fillStyle = "#c5d2de"
      ctx.font = "12px Segoe UI, sans-serif"
      ctx.fillText("Americas", width * 0.18, 28)
      ctx.fillText("Europe", width * 0.48, 28)
      ctx.fillText("Africa", width * 0.52, height * 0.62)
      ctx.fillText("Asia Pacific", width * 0.74, 28)
      for (const marker of markers) {
        const x = ((marker.lon + 180) / 360) * width
        const y = ((90 - marker.lat) / 180) * height
        ctx.beginPath()
        ctx.fillStyle = marker.severity === "flash" ? "#ff6b5a" : marker.severity === "priority" ? "#f0b429" : "#9fd7ff"
        ctx.arc(x, y, marker.severity === "info" ? 3.5 : 5.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    draw()
    window.addEventListener("resize", draw)
    return () => window.removeEventListener("resize", draw)
  }, [markers])

  return <canvas ref={ref} role="img" aria-label="Flat map of the same markers" style={{ width: "100%", height: "auto" }} />
}
