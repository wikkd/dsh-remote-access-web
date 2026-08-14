// Consumer-side runtime bundle for Git and tarball installs. The prepare
// script emits type declarations first (tsc -> lib/types), then this config
// bundles the runtime entry to lib/index.js / lib/invariant.js with no
// repository project references. Because the package is "type": "module",
// .js output is ESM, so keep entries and update the manifest's exports.
export default [
  {
    entry: {
      index: 'src/index.ts',
      invariant: 'src/invariant.ts',
    },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2022',
    tsconfig: 'tsconfig.prepare.json',
    fixedExtension: false,
  },
]
