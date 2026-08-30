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
  build: {
    outDir: 'dist/foundry',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/adapters/foundry/module-entry.ts'),
      formats: ['es'],
      fileName: () => 'archivexus.js',
    },
  },
});
