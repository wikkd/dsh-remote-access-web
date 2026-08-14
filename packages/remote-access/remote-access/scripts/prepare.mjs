// Zero-dependency prepare script: builds lib/{index,invariant}.js from src
// using the locally installed typescript + tsdown, so a Git or tarball install
// of this repository produces a runnable package without the main-harness
// build pipeline. Requires `pnpm install` first (installs typescript + tsdown
// as devDependencies).

import { existsSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)

function localBin(pkg, bin) {
  return join(dirname(require.resolve(`${pkg}/package.json`)), bin)
}

rmSync(join(root, 'lib'), { recursive: true, force: true })

// 1) emit declarations to lib/types.<!--- keep types per exports layout -->
const steps = [
  ['tsc', localBin('typescript', 'bin/tsc'), ['-p', 'tsconfig.prepare.json']],
  ['tsdown', localBin('tsdown', 'dist/run.mjs'), ['--config', 'tsdown.prepare.config.mjs']],
]

for (const [name, entry, args] of steps) {
  if (!existsSync(entry)) {
    console.error(`prepare: missing local executable ${entry}; run pnpm install first`)
    process.exit(1)
  }
  const result = spawnSync(process.execPath, [entry, ...args], { cwd: root, stdio: 'inherit' })
  if (result.error !== undefined) {
    console.error(`prepare: failed to run ${name}: ${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}
