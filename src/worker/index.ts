import { assembleSnapshot, emptyPartial, type Snapshot, type SweepPartial } from "../logic/assemble"
import { SWEEP_INTERVAL_MS, SWEEP_MINUTES } from "../logic/config"
import { BATCHES, missingKeyAttempts, type WorkerEnv } from "./batches"

const SNAPSHOT_KEY = "snapshot:v1"

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === "/api/health") return json({ name: "Worldmeter", ok: true, sweepMinutes: SWEEP_MINUTES })
    if (url.pathname === "/api/snapshot") return snapshotResponse(request, env, ctx)
    if (url.pathname === "/internal/sweep" && request.method === "POST") return internalSweep(request, env)
    if (url.pathname.startsWith("/internal/batch/")) return internalBatch(request, env)
    return env.ASSETS.fetch(request)
  },

  async scheduled(controller: ScheduledController, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    console.log(JSON.stringify({ msg: "cron", cron: controller.cron }))
    ctx.waitUntil(runScheduled(env))
  },
}

async function snapshotResponse(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
  const cacheKey = new Request(new URL("/api/snapshot", request.url).toString())
  const cached = await caches.default.match(cacheKey)
  if (cached) return cached

  let snapshot = await readSnapshot(env)
  if ((isLocal(request) || presentSecret(env.SWEEP_INLINE)) && isStale(snapshot)) {
    snapshot = await runInline(env)
  }
  if (!snapshot) {
    return json(
      { ready: false, message: "The first sweep has not finished. Feeds are collected every 2 minutes." },
      200,
    )
  }
  const response = json(snapshot)
  ctx.waitUntil(caches.default.put(cacheKey, response.clone()))
  return response
}

async function internalSweep(request: Request, env: WorkerEnv): Promise<Response> {
  if (!(await authorized(request, env.SWEEP_SECRET))) return json({ ok: false, error: "Unauthorized" }, 401)
  const snapshot = await runFanout(request, env)
  return json({ ok: true, generatedAt: snapshot.generatedAt, sources: snapshot.sources.length })
}

async function internalBatch(request: Request, env: WorkerEnv): Promise<Response> {
  if (!(await authorized(request, env.SWEEP_SECRET))) return json({ ok: false, error: "Unauthorized" }, 401)
  const name = new URL(request.url).pathname.split("/").pop() ?? ""
  const batch = BATCHES[name]
  if (!batch) return json({ error: "Unknown batch" }, 404)
  return json(await batch(env))
}

async function runScheduled(env: WorkerEnv): Promise<void> {
  if (!presentSecret(env.SWEEP_SECRET)) {
    console.log(JSON.stringify({ msg: "sweep skipped", reason: "SWEEP_SECRET is not set" }))
    return
  }
  const response = await fetch(`${env.PUBLIC_SITE_URL}/internal/sweep`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.SWEEP_SECRET}` },
  })
  if (!response.ok) {
    console.log(JSON.stringify({ msg: "sweep failed", status: response.status }))
  }
}

async function runFanout(request: Request, env: WorkerEnv): Promise<Snapshot> {
  const origin = new URL(request.url).origin
  const headers = { authorization: request.headers.get("Authorization") ?? "" }
  const parts = await Promise.all(Object.keys(BATCHES).map(async (name) => {
    try {
      const response = await fetch(`${origin}/internal/batch/${name}`, { headers })
      if (!response.ok) return emptyPartial()
      return (await response.json()) as SweepPartial
    } catch (error) {
      console.log(JSON.stringify({ msg: "batch failed", name, error: error instanceof Error ? error.message : "error" }))
      return emptyPartial()
    }
  }))
  return persist(env, [...parts, keyPartial(env)])
}

async function runInline(env: WorkerEnv): Promise<Snapshot> {
  const parts = await Promise.all(Object.values(BATCHES).map((batch) => batch(env)))
  return persist(env, [...parts, keyPartial(env)])
}

function keyPartial(env: WorkerEnv) {
  const partial = emptyPartial()
  partial.attempts.push(...missingKeyAttempts(env))
  return partial
}

async function persist(env: WorkerEnv, parts: Parameters<typeof assembleSnapshot>[0]): Promise<Snapshot> {
  const previous = (await readSnapshot(env))?.sources ?? []
  const snapshot = assembleSnapshot(parts, previous, new Date().toISOString(), env.SOURCE_REPO_URL || "")
  await env.SNAPSHOTS.put(SNAPSHOT_KEY, JSON.stringify(snapshot))
  return snapshot
}

async function readSnapshot(env: WorkerEnv): Promise<Snapshot | null> {
  const raw = await env.SNAPSHOTS.get(SNAPSHOT_KEY, { cacheTtl: 60 })
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Snapshot
    if (!parsed?.ready || !parsed.generatedAt) return null
    return parsed
  } catch {
    return null
  }
}

function isStale(snapshot: Snapshot | null): boolean {
  if (!snapshot) return true
  return Date.now() - Date.parse(snapshot.generatedAt) > SWEEP_INTERVAL_MS
}

function isLocal(request: Request): boolean {
  const hosts = [new URL(request.url).host, request.headers.get("host") ?? ""]
  return hosts.some((host) => host.startsWith("127.0.0.1") || host.startsWith("localhost") || host.startsWith("[::1]"))
}

function presentSecret(value: string | undefined): boolean {
  return Boolean(value && value.trim())
}

async function authorized(request: Request, secret: string | undefined): Promise<boolean> {
  if (!presentSecret(secret)) return false
  const offered = new TextEncoder().encode(request.headers.get("Authorization") ?? "")
  const expected = new TextEncoder().encode(`Bearer ${secret}`)
  if (offered.byteLength !== expected.byteLength) return false
  const offeredHash = new Uint8Array(await crypto.subtle.digest("SHA-256", offered))
  const expectedHash = new Uint8Array(await crypto.subtle.digest("SHA-256", expected))
  let diff = 0
  for (let index = 0; index < offeredHash.length; index += 1) diff |= offeredHash[index] ^ expectedHash[index]
  return diff === 0
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=30",
    },
  })
}
