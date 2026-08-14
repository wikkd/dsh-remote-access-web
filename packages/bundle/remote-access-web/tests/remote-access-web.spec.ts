/**
 * The bundle's substance is its patch file: the `dsh.bundle.patch` manifest
 * field must name a real, parseable patch list that inserts the remote-access
 * host row over the dsh-web-app surface, reading its config from the
 * deployment environment rather than literal values.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { evaluate } from '@deepseek-ai/cordis-plugin-loader'

describe('dsh-remote-access-web bundle', () => {
  it('declares a parseable patch list that mounts the remote-access row through the manifest field', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(
      readFileSync(resolve(root, 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    const parsed = yaml.load(
      readFileSync(resolve(root, manifest.dsh!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    )
    if (!Array.isArray(parsed)) throw new TypeError('remote-access-web patch must parse to a patch list')
    const rows = parsed.flatMap((patch): Record<string, unknown>[] =>
      typeof patch === 'object' && patch !== null
        ? (patch as { insert?: Record<string, unknown>[] }).insert ?? []
        : [],
    )
    // Exactly one row: the reverse-tunnel host plugin, mounted over web-app.
    expect(rows).toHaveLength(1)
    const row = rows.find(candidate => candidate.id === 'remote-access')
    if (row === undefined) throw new TypeError('remote-access-web patch must mount the remote-access row')
    expect(row['name']).toBe('@deepseek-ai/dsh-remote-access')
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-remote-access')
  })

  it('reads the tunnel config from the deployment environment, defaulting the provider to none', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const parsed = yaml.load(
      readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8'),
      { schema: entryListSchema },
    )
    if (!Array.isArray(parsed)) throw new TypeError('remote-access-web patch must parse to a patch list')
    const rows = parsed.flatMap((patch): Record<string, unknown>[] =>
      typeof patch === 'object' && patch !== null
        ? (patch as { insert?: Record<string, unknown>[] }).insert ?? []
        : [],
    )
    const row = rows.find(candidate => candidate.id === 'remote-access')
    if (row === undefined) throw new TypeError('remote-access-web patch must carry an insert list with one row')
    const config = row['config'] as Record<string, unknown>

    const provider = (config['provider'] as { __jsExpr?: string } | undefined)?.__jsExpr
    expect(provider).toBe('process.env.DSH_REMOTE_ACCESS_PROVIDER || \'none\'')
    // Absent env keeps the schema default (inert); a named provider opts in.
    expect(evaluate({ process: { env: {} } }, provider!)).toBe('none')
    expect(evaluate({ process: { env: { DSH_REMOTE_ACCESS_PROVIDER: 'frp' } } }, provider!)).toBe('frp')

    // The tunnel-specific fields are all env-derived optionals, not literal.
    const frpcPath = (config['frpcPath'] as { __jsExpr?: string } | undefined)?.__jsExpr
    const frpArgs = (config['frpArgs'] as { __jsExpr?: string } | undefined)?.__jsExpr
    const publicUrl = (config['publicUrl'] as { __jsExpr?: string } | undefined)?.__jsExpr
    expect(frpcPath).toBe('process.env.DSH_REMOTE_ACCESS_FRPC_PATH')
    expect(frpArgs).toBe('process.env.DSH_REMOTE_ACCESS_FRP_ARGS')
    expect(publicUrl).toBe('process.env.DSH_REMOTE_ACCESS_PUBLIC_URL')
  })
})
