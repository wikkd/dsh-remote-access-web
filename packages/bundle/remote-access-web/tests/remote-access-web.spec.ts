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
  const patch = (rootDir = '../') => {
    const root = fileURLToPath(new URL(rootDir, import.meta.url))
    const parsed = yaml.load(
      readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8'),
      { schema: entryListSchema },
    )
    if (!Array.isArray(parsed)) throw new TypeError('remote-access-web patch must parse to a patch list')
    return parsed as Record<string, unknown>[]
  }
  const inserts = (patches: Record<string, unknown>[]) =>
    patches.flatMap(patchEntry =>
      typeof patchEntry === 'object' && patchEntry !== null
        ? (patchEntry as { insert?: Record<string, unknown>[] }).insert ?? []
        : [],
    )

  it('declares a parseable patch list that mounts the remote-access row and pins the browse directory picker', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(
      readFileSync(resolve(root, 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    const patches = patch()
    const rows = inserts(patches)

    // The reverse-tunnel host plugin, mounted over web-app.
    const row = rows.find(candidate => candidate.id === 'remote-access')
    if (row === undefined) throw new TypeError('remote-access-web patch must mount the remote-access row')
    expect(row['name']).toBe('@deepseek-ai/dsh-remote-access')
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-remote-access')

    // A remote deployment must use the in-app browse picker, not the adaptive
    // chooser web-app mounts (which resolves to a native OS dialog on loopback).
    const disable = patches.find(p =>
      typeof p === 'object' && p !== null && 'id' in p && !('insert' in p),
    ) as Record<string, unknown> | undefined
    expect(disable?.['id']).toBe('directory-picker')
    expect(disable?.['disabled']).toBe(true)
    expect(rows.find(c => c['id'] === 'directory-picker-browse')?.['name'])
      .toBe('@deepseek-ai/dsh-host-directory-picker-browse')
    expect(rows.find(c => c['id'] === 'ui-directory-picker-browse')?.['name'])
      .toBe('@deepseek-ai/dsh-client-ui-directory-picker-browse')
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-host-directory-picker-browse')
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-client-ui-directory-picker-browse')
  })

  it('reads the tunnel config from the deployment environment, defaulting the provider to none', () => {
    const rows = inserts(patch('../'))
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
