// Zero-dependency prepare script: emits lib/index.js and lib/types/index.d.ts
// from the single empty-runtime source. The bundle carries no runtime API; the
// package's substance is cordis.patch.yml. Keeping this script dependency-free
// means a Git or tarball install needs no build toolchain.
//
// It imports the src module under Node, then writes an ESM wrapper that
// re-exports it, so the emitted artifact stays in lockstep with the source.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const srcFile = join(root, 'src', 'index.ts')
const src = readFileSync(srcFile, 'utf8')

// Strip the leading JSDoc comment block; `export {}` is valid in both TS and ESM JS.
const runtime = src.replace(/^\/\*\*[\s\S]*?\*\/\n*/, '').trim() + '\n'

const outJs = join(root, 'lib', 'index.js')
const outDts = join(root, 'lib', 'types', 'index.d.ts')
mkdirSync(dirname(outJs), { recursive: true })
mkdirSync(dirname(outDts), { recursive: true })

writeFileSync(outJs, runtime)
writeFileSync(outDts, 'export {}\n')

console.log('prepare: wrote lib/index.js and lib/types/index.d.ts')
