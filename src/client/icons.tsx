import type { Marker } from "../logic/markers"

export const EVENT_TYPES = [
  { id: "quake", label: "Quake", color: "#ff5b4a" },
  { id: "fire", label: "Fire", color: "#f0b429" },
  { id: "weather", label: "Weather", color: "#7eb6ff" },
  { id: "news", label: "News", color: "#e07a5f" },
  { id: "outage", label: "Outage", color: "#c084fc" },
  { id: "flight", label: "Flight", color: "#9fd7ff" },
  { id: "radiation", label: "Radiation", color: "#c6f56b" },
  { id: "space", label: "Space", color: "#f4f7fb" },
  { id: "chokepoint", label: "Chokepoint", color: "#f2d16b" },
  { id: "market", label: "Market", color: "#b7f0c8" },
] as const

export type EventTypeId = (typeof EVENT_TYPES)[number]["id"]

const PATHS: Record<EventTypeId, string> = {
  quake: '<path d="M3 14h3.5l2-7 3.2 11 2.2-6H21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  fire: '<path d="M12 3s4 4 4 8a4 4 0 1 1-8 0c0-1.5.8-2.8 1.4-3.8C8.2 9.2 7 11.4 7 14a5 5 0 0 0 10 0c0-5-5-11-5-11z" fill="currentColor"/>',
  weather: '<path d="M7 16h10a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6-1.2A3.5 3.5 0 0 0 7 16z" fill="none" stroke="currentColor" stroke-width="2"/>',
  news: '<path d="M5 9h6v8H5zM13 10h6M13 14h6M13 17h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4 7h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  outage: '<path d="M12 3v6M7 8l2 3M17 8l-2 3M8 19h8M9 15h6l-1 4H10z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 5l14 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  flight: '<path d="M3 13l18-5-6 8 2 4-3-2-4 3 1-5-8-3z" fill="currentColor"/>',
  radiation: '<circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 4a8 8 0 0 1 6.9 4l-3.4 2A4 4 0 0 0 12 8zM5.1 8A8 8 0 0 1 12 4v4a4 4 0 0 0-3.5 2zM8.2 18.4A8 8 0 0 0 15.8 18.4l-1.7-3.4a4 4 0 0 1-4.2 0z" fill="currentColor"/>',
  space: '<path d="M8 16l-2 4 4-2 8-8a3 3 0 0 0-4-4L8 16z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="14" cy="10" r="1" fill="currentColor"/>',
  chokepoint: '<path d="M12 3v12M8 7h8M9 21c1.2-2 4.8-2 6 0M12 15c-3 0-5 2-5 4h10c0-2-2-4-5-4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  market: '<path d="M4 18V10M10 18V6M16 18v-7M22 18H2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
}

export function eventType(kind: string, title = ""): EventTypeId {
  const text = `${kind} ${title}`
  if (kind === "Quake") return "quake"
  if (kind === "Fire" || /wildfire|volcano|thermal/i.test(text)) return "fire"
  if (kind === "Weather" || /storm|cyclone|flood|rain/i.test(text) || /ice/i.test(kind)) return "weather"
  if (kind === "Flight") return "flight"
  if (kind === "Radiation") return "radiation"
  if (kind === "ISS") return "space"
  if (kind === "Chokepoint") return "chokepoint"
  if (/outage/i.test(text)) return "outage"
  if (kind === "Market") return "market"
  return "news"
}

export function iconSize(severity: string): number {
  if (severity === "flash") return 30
  if (severity === "priority") return 24
  if (severity === "routine") return 20
  return 16
}

export function iconSvg(id: EventTypeId): string {
  return `<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">${PATHS[id]}</svg>`
}

export function eventColor(id: EventTypeId): string {
  return EVENT_TYPES.find((type) => type.id === id)?.color ?? "#c5d2de"
}

export function Legend({
  active,
  onToggle,
}: {
  active: readonly string[]
  onToggle: (id: EventTypeId) => void
}) {
  return (
    <div className="legend" role="group" aria-label="Map layers">
      {EVENT_TYPES.map((type) => (
        <button
          key={type.id}
          type="button"
          className="btn layer"
          aria-pressed={active.includes(type.id)}
          onClick={() => onToggle(type.id)}
        >
          <span className="legend-icon" style={{ color: type.color }} dangerouslySetInnerHTML={{ __html: iconSvg(type.id) }} />
          {type.label}
        </button>
      ))}
      <span className="legend-note">A numbered circle is a cluster of nearby events.</span>
    </div>
  )
}

export function markerElement(marker: Marker, onPick: (marker: Marker) => void): HTMLButtonElement {
  const type = eventType(marker.kind, marker.title)
  const size = iconSize(marker.severity)
  const button = document.createElement("button")
  button.type = "button"
  button.className = "event-marker"
  button.style.width = `${size}px`
  button.style.height = `${size}px`
  button.style.color = eventColor(type)
  button.dataset.eventType = type
  button.innerHTML = iconSvg(type)
  button.setAttribute("aria-label", `${typeLabel(type)}: ${marker.title}`)
  button.title = marker.title
  button.addEventListener("click", (event) => {
    event.stopPropagation()
    onPick(marker)
  })
  return button
}

export function clusterElement(count: number, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button")
  button.type = "button"
  button.className = "event-cluster"
  button.textContent = count > 99 ? "99+" : String(count)
  button.setAttribute("aria-label", `${count} events clustered here`)
  button.addEventListener("click", (event) => {
    event.stopPropagation()
    onClick()
  })
  return button
}

function typeLabel(id: EventTypeId): string {
  return EVENT_TYPES.find((type) => type.id === id)?.label ?? id
}
