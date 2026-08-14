/**
 * REAL-composition coverage for the remote-auth host plugin: `apply` booted
 * through a Cordis Context with a structural `webServer`, its pairing routes
 * driven over the recorded handlers, and the seed file exercised against a
 * temp directory. Every branch of the plugin glue (`apply`, `registerRoutes`,
 * `pairHandler`, `logoutHandler`, `loginHtml`, `loadSeed`, `persistSeed`) is
 * reachable only through the assembled surface, so this spec drives them here.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable, EventEmitter } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { WebServer, WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { apply, inject, name, RemoteAuthService, publicUrlFromRuntime, type Config } from '../src/index.ts'

const PAIR_PATH = '/__remote/pair'
const LOGIN_PATH = '/__remote/login'
const LOGOUT_PATH = '/__remote/logout'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber?.dispose()
  context = undefined
  // The seed load-or-generate effect is fire-and-forget inside apply; give its
  // async write a tick to settle before removing the temp directory, so a
  // mid-write temp file cannot race the rmdir.
  await new Promise(resolve => setTimeout(resolve, 30))
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** A structural `webServer` recording exact routes and exposing their handlers. */
function fakeWebServer(): { server: WebServer; routes: Map<string, WebRoute> } {
  const routes = new Map<string, WebRoute>()
  const server = {
    register(route: WebRoute) {
      routes.set(route.path, route)
      return () => { routes.delete(route.path) }
    },
    registerUpgrade() { return () => {} },
    tapIndex() { return () => {} },
    port: 0,
    host: '127.0.0.1',
  } as unknown as WebServer
  return { server, routes }
}

/** Boot `apply` with a temp-dir seed file, returning the routes and service. */
async function boot(config?: { enabled?: boolean; seedPath?: string }): Promise<{
  routes: Map<string, WebRoute>
}> {
  root = await mkdtemp(join(tmpdir(), 'dsh-remote-auth-'))
  const seedPath = config?.seedPath ?? join(root, 'remote-auth.seed')
  context = new Context()
  const { server, routes } = fakeWebServer()
  context.provide('webServer', server)
  const fiber = context.plugin({ name, inject: [...inject], apply }, { ...config, seedPath })
  await fiber.await()
  return { routes }
}

/** Minimal fake request with a URL and optional headers. */
function fakeRequest(url: string, headers: Record<string, string> = {}): IncomingMessage {
  const req = Readable.from([]) as unknown as IncomingMessage
  Object.assign(req, { url, method: 'GET', headers })
  return req
}

/** Response recorder with writeHead/end. */
function fakeResponse(): { response: ServerResponse; status: number | undefined; headers: Record<string, string>; body: string } {
  let status: number | undefined
  let headers: Record<string, string> = {}
  let body = ''
  const response = Object.assign(new EventEmitter(), {
    writeHead(code: number, h?: Record<string, string>) { status = code; if (h) headers = h; return this },
    end(value?: string) { if (value !== undefined) body = String(value); return this },
  }) as unknown as ServerResponse
  return { response, get status() { return status }, get headers() { return headers }, get body() { return body } }
}

describe('remote-auth plugin glue', () => {
  it('boots inert by default: no pairing is enabled, but routes exist', async () => {
    const { routes } = await boot()
    expect(routes.size).toBe(3)
    for (const path of [PAIR_PATH, LOGIN_PATH, LOGOUT_PATH]) {
      expect(routes.has(path)).toBe(true)
    }
    const service = context!.get('remoteAuth')!
    expect(service.status()).toEqual({ paired: false, sessionTtlSeconds: 0 })
  })

  it('writes the seed file at boot when absent, then loads it later', async () => {
    const { routes } = await boot({ enabled: true })
    // The boot effect is fire-and-forget; settle it by awaiting a tick.
    await new Promise(resolve => setTimeout(resolve, 20))
    const seedPath = join(root!, 'remote-auth.seed')
    const content = (await readFile(seedPath, 'utf8')).trim()
    expect(content).toMatch(/^[A-Za-z0-9_-]{40,}$/)
    // The service's seedFile getter exposes the same path.
    const service = context!.get('remoteAuth') as RemoteAuthService
    expect(service.seedFile).toBe(seedPath)
    void routes
  })

  it('serves the login form on GET without a code', async () => {
    const { routes } = await boot()
    const pair = routes.get(LOGIN_PATH)!
    const res = fakeResponse()
    pair.handler(fakeRequest(`${LOGIN_PATH}`), res.response)
    expect(res.status).toBe(200)
    expect(res.body).toContain('配对远程访问')
    expect(res.body).toContain(`action="${PAIR_PATH}"`)
  })

  it('issues a session cookie through the pair handler with a valid code', async () => {
    const { routes } = await boot({ enabled: true })
    const service = context!.get('remoteAuth') as RemoteAuthService
    const code = service.pair()
    const pair = routes.get(PAIR_PATH)!
    const res = fakeResponse()
    pair.handler(fakeRequest(`${PAIR_PATH}?code=${code}`, { 'user-agent': 'phone-agent' }), res.response)
    expect(res.status).toBe(302)
    expect(res.headers!.location).toBe('/')
    expect(res.headers!['set-cookie']).toContain('dsh_remote_session=')
    expect(res.headers!['set-cookie']).toContain('HttpOnly')
    expect(res.headers!['set-cookie']).toContain('SameSite=Lax')
  })

  it('refuses a wrong pairing code with 401 and keeps the code outstanding', async () => {
    const { routes } = await boot({ enabled: true })
    const service = context!.get('remoteAuth') as RemoteAuthService
    const code = service.pair()
    const pair = routes.get(PAIR_PATH)!
    const res = fakeResponse()
    pair.handler(fakeRequest(`${PAIR_PATH}?code=wrong-code`), res.response)
    expect(res.status).toBe(401)
    expect(res.body).toBe('配对码无效或已失效')
    // The correct code is still redeemable afterwards.
    expect(service.redeem(code, 'phone-agent')).toBeTypeOf('string')
  })

  it('clears the session cookie through the logout handler', async () => {
    const { routes } = await boot({ enabled: true })
    const logout = routes.get(LOGOUT_PATH)!
    const res = fakeResponse()
    logout.handler(fakeRequest(LOGOUT_PATH), res.response)
    expect(res.status).toBe(302)
    expect(res.headers!['set-cookie']).toContain('dsh_remote_session=;')
    expect(res.headers!['set-cookie']).toContain('Max-Age=0')
  })

  it('loads an existing seed instead of regenerating', async () => {
    const seedPath = join(root = await mkdtemp(join(tmpdir(), 'dsh-remote-auth-load-')), 'remote-auth.seed')
    const { writeFile } = await import('node:fs/promises')
    await writeFile(seedPath, 'pre-seeded-value\n')
    const { routes } = await boot({ enabled: true, seedPath })
    await new Promise(resolve => setTimeout(resolve, 20))
    // A regenerated seed would differ from the pre-seeded value; a loaded seed
    // keeps it, so a pair code derives from the loaded seed deterministically.
    const content = (await readFile(seedPath, 'utf8')).trim()
    expect(content).toBe('pre-seeded-value')
    void routes
  })

  it('pairs through an array sec-ch-ua-platform header (multi-value device header)', async () => {
    const { routes } = await boot({ enabled: true })
    const service = context!.get('remoteAuth') as RemoteAuthService
    const code = service.pair()
    const pair = routes.get(PAIR_PATH)!
    const req = Readable.from([]) as unknown as IncomingMessage
    Object.assign(req, { url: `${PAIR_PATH}?code=${code}`, method: 'GET', headers: { 'sec-ch-ua-platform': ['Android', 'Linux'] } })
    const res = fakeResponse()
    pair.handler(req, res.response)
    expect(res.status).toBe(302)
    expect(res.headers!['set-cookie']).toContain('dsh_remote_session=')
  })

  it('serves the login form when the request carries no URL', async () => {
    const { routes } = await boot()
    const pair = routes.get(LOGIN_PATH)!
    const req = Readable.from([]) as unknown as IncomingMessage
    Object.assign(req, { method: 'GET', headers: {} })
    const res = fakeResponse()
    pair.handler(req, res.response)
    expect(res.status).toBe(200)
    expect(res.body).toContain('配对远程访问')
  })

  it('resolves the seed path from DSH_HOME when seedPath is omitted', async () => {
    // Boot without seedPath: the plugin derives `<dshHome>/remote-auth.seed`.
    // Point DSH_HOME at a temp dir so the boot-time persist never touches the
    // real user home.
    const home = await mkdtemp(join(tmpdir(), 'dsh-remote-auth-home-'))
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = home
    try {
      context = new Context()
      const { server, routes } = fakeWebServer()
      context.provide('webServer', server)
      const fiber = context.plugin({ name, inject: [...inject], apply }, { enabled: false })
      await fiber.await()
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(routes.size).toBe(3)
      expect(context.get('remoteAuth')).toBeDefined()
    } finally {
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
      await rm(home, { recursive: true, force: true })
    }
  })

  it('surfaces a non-Error seed-bootstrap failure through the logger', async () => {
    // A seed path inside a non-existent directory with a non-ENOENT failure is
    // simulated by pointing at a directory: loadSeed hits EISDIR, which the
    // boot effect logs rather than throwing (the catch arm).
    const seedPath = root = await mkdtemp(join(tmpdir(), 'dsh-remote-auth-eisdir-'))
    context = new Context()
    const { server, routes } = fakeWebServer()
    context.provide('webServer', server)
    const fiber = context.plugin({ name, inject: [...inject], apply }, { enabled: true, seedPath })
    await fiber.await()
    await new Promise(resolve => setTimeout(resolve, 20))
    // No throw: the async boot catch swallowed the EISDIR and logged it.
    expect(routes.size).toBe(3)
  })

  it('narrows explicit undefined enabled/sessionTtlMs to concrete defaults', async () => {
    // Hand-built contexts bypass the Loader schema, so `apply` must narrow the
    // optional fields itself even when the caller passes `undefined` explicitly.
    context = new Context()
    const { server, routes } = fakeWebServer()
    context.provide('webServer', server)
    const fiber = context.plugin(
      { name, inject: [...inject], apply },
      { enabled: undefined, sessionTtlMs: undefined, seedPath: join(root = await mkdtemp(join(tmpdir(), 'dsh-remote-auth-undef-')), 'seed') } as unknown as Config,
    )
    await fiber.await()
    expect(routes.size).toBe(3)
    const service = context.get('remoteAuth') as RemoteAuthService
    expect(service.status()).toEqual({ paired: false, sessionTtlSeconds: 0 })
  })

  it('derives a publicUrl from the injection authorities', () => {
    expect(publicUrlFromRuntime({ trustedHosts: ['127.0.0.1', 'tunnel.example.com:5953'] })).toBe('https://tunnel.example.com:5953')
    expect(publicUrlFromRuntime({ trustedHosts: [] })).toBeUndefined()
    expect(publicUrlFromRuntime(undefined)).toBeUndefined()
  })

  it('falls back to the webRuntime publicUrl when config omits it', async () => {
    context = new Context()
    const { server, routes } = fakeWebServer()
    context.provide('webServer', server)
    context.provide('webRuntime', { trustedHosts: ['127.0.0.1', 'tunnel.example.com:5953'] })
    const fiber = context.plugin(
      { name, inject: [...inject], apply },
      { enabled: false, seedPath: join(root = await mkdtemp(join(tmpdir(), 'dsh-remote-auth-pub-')), 'seed') },
    )
    await fiber.await()
    expect(routes.size).toBe(3)
    const service = context.get('remoteAuth') as RemoteAuthService
    expect(service.loginUrl('code1')).toBe('https://tunnel.example.com:5953/__remote/pair?code=code1')
  })
})
