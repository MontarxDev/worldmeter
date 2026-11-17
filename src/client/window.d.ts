import type { GlobeInstance } from "globe.gl"
import type { CountryFeature } from "../logic/geo"

declare global {
  interface Window {
    __worldmeterGlobe?: GlobeInstance
    __worldmeterCountries?: CountryFeature[]
    __worldmeterMap?: {
      project: (lnglat: [number, number]) => { x: number; y: number }
      jumpTo: (options: { center: [number, number]; zoom: number }) => void
      whenIdle: () => Promise<void>
      featuresAt: (point: { x: number; y: number }) => unknown[]
      getContainer: () => HTMLElement
    }
  }
}

declare module "*.css"

export {}
