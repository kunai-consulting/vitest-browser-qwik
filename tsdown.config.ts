import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts', './src/pure.ts'],
  format: ['esm'],
  dts: true,
  platform: "browser",
  external: [
    '@vitest/browser/context',
    '@vitest/browser/utils',
    'vitest'
  ],
});