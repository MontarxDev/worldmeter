export const USER_AGENT = "Worldmeter/1.0 (+https://news.montarx.com)"

export function present(value: string | undefined): boolean {
  return Boolean(value && value.trim())
}

export function failureMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") return "Timed out"
    return error.message.replace(/\s+/g, " ").slice(0, 180) || "Fetch failed"
  }
  return "Fetch failed"
}

/**
 * Read a response but keep only the trailing bytes. EPA RadNet publishes a
 * year-long CSV and ignores Range, so the safety batch streams the file and
 * parses the newest rows instead of the January header.
 */
export async function fetchTail(
  url: string,
  keepBytes: number,
  timeoutMs = 12_000,
): Promise<{ status: number; ok: boolean; text: string }> {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/csv, text/plain, */*",
    },
    signal: AbortSignal.timeout(timeoutMs),
  })
  const reader = response.body?.getReader()
  if (!reader) {
    const text = await response.text()
    return { status: response.status, ok: response.ok, text: text.slice(-keepBytes) }
  }
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done || !value) break
      chunks.push(value)
      total += value.byteLength
      while (chunks.length > 1 && total - chunks[0].byteLength >= keepBytes) {
        total -= chunks.shift()!.byteLength
      }
      if (chunks.length === 1 && chunks[0].byteLength > keepBytes) {
        chunks[0] = chunks[0].slice(chunks[0].byteLength - keepBytes)
        total = keepBytes
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { status: response.status, ok: response.ok, text: new TextDecoder().decode(bytes) }
}

export async function fetchCapped(
  url: string,
  opts: {
    maxBytes?: number
    headers?: HeadersInit
    timeoutMs?: number
    method?: string
    body?: string
  } = {},
): Promise<{ status: number; ok: boolean; text: string }> {
  const maxBytes = opts.maxBytes ?? 80_000
  const response = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/json, application/geo+json, text/csv, application/xml, text/xml, */*",
      ...Object.fromEntries(new Headers(opts.headers).entries()),
    },
    body: opts.body,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 8_000),
  })
  const text = await readAtMost(response, maxBytes)
  return { status: response.status, ok: response.ok, text }
}

async function readAtMost(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return (await response.text()).slice(0, maxBytes)
  const chunks: Uint8Array[] = []
  let received = 0
  try {
    while (received < maxBytes) {
      const { done, value } = await reader.read()
      if (done || !value) break
      const room = maxBytes - received
      chunks.push(value.byteLength > room ? value.slice(0, room) : value)
      received += Math.min(value.byteLength, room)
      if (value.byteLength > room) break
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

export function readJson<T>(text: string, status: number): T {
  if (status < 200 || status >= 300) throw new Error(`HTTP ${status}`)
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`HTTP ${status} returned unreadable JSON`)
  }
}
