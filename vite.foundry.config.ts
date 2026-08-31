import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * Build config for the Foundry-distributed bundle only (ADR-0006). Produces
 * a single ES module — src/adapters/foundry/module-entry.ts and whatever it
 * imports from src/core, nothing else — so no other adapter's code can ever
 * end up inside a Foundry world's module folder.
 *
 * This is a separate config from the project's general `vite build` on
 * purpose, not a temporary split: each platform Archivexus adapts to (or a
 * future standalone Web UI) should get its own build target rather than
 * sharing one bundle.
 *
 * Run with: npm run build:foundry-module
 */
export default defineConfig({
  // Vite's default base ('/') bakes ABSOLUTE root-relative URLs into any
  // asset/worker reference it emits (e.g. `new URL('./x.worker.js',
  // import.meta.url)` becomes "/assets/x.worker-HASH.js"). That's wrong
  // here: Foundry serves this bundle from a nested static path
  // (/modules/archivexus/dist/foundry/...), not domain root — confirmed
  // live via the STORE-002 spike, whose Worker chunk 404'd at the
  // root-relative path while the same file served fine at its real,
  // module-relative one. A relative base makes Vite emit paths relative to
  // archivexus.js's own location instead, which resolves correctly
  // wherever Foundry mounts the module.
  base: './',
  build: {
    outDir: 'dist/foundry',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/adapters/foundry/module-entry.ts'),
      formats: ['es'],
      fileName: () => 'archivexus.js',
    },
  },
  // STORE-002 feasibility spike only (ADR-0008 point 8, opfs-worker-spike.ts)
  // needs a real Worker built with code-splitting (it does a dynamic
  // `import('@sqlite.org/sqlite-wasm')` inside the worker), and Rollup
  // rejects code-split workers built as 'iife'/'umd' (Vite's default worker
  // format) — 'es' is required. Foundry serves the whole module folder as
  // static files, so the extra chunk this emits alongside archivexus.js is
  // still reachable even though module.json's esmodules list only names the
  // main entry. Revisit this setting if it's still needed once the spike
  // is removed / becomes real storage-layer code.
  worker: {
    format: 'es',
  },
});
