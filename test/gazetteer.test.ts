import { describe, expect, it } from "vitest"
import { matchPlace } from "../src/logic/gazetteer"
import { parseRssItems } from "../src/logic/parse"

describe("headline places", () => {
  it("pins a named city and skips a Latin America mention", () => {
    expect(matchPlace("Aftershock felt in Tokyo")?.name).toBe("Tokyo")
    expect(matchPlace("Summit covers Latin America")?.name).not.toBe("America")
    expect(matchPlace("Flooding in Lagos")?.lat).toBeCloseTo(6.45, 1)
  })

  it("reads RSS coordinates ahead of a place name", () => {
    const xml = `<rss><channel><item><title>Quake near Tokyo</title><link>https://example.com/q</link><georss:point>35.6 139.7</georss:point></item></channel></rss>`
    const [item] = parseRssItems(xml, 2)
    expect(item.lat).toBeCloseTo(35.6)
    expect(item.lon).toBeCloseTo(139.7)
  })
})
