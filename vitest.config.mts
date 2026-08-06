// Authored by DotWin
// Vitest configuration.
//
// This file is `.mts`, not `.ts`, on purpose. The package is CommonJS (no
// `"type": "module"`), so Vite's native config loader had to read a `.ts`
// config as CommonJS and warned that the ESM syntax in it is unsupported by
// `configLoader: 'native'`, which becomes the default in a future major. An
// `.mts` extension is loaded as ESM natively, which is the documented fix and
// leaves the rest of the CommonJS package alone. Vitest resolves
// `vitest.config.mts` with no extra flags, so `vitest run` is unchanged.
import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ESM has no `__dirname`; derive it from this module's own URL.
const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: [],
    include: ['test/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/app/**/page.tsx', 'src/app/**/layout.tsx'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
    },
  },
})
