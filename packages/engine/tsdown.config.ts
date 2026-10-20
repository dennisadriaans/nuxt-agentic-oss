import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/definition.ts',
    'src/markdown.ts',
    'src/tools.ts',
    'src/providers.ts',
    'src/runtime.ts',
    'src/runs.ts',
    'src/scheduling.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
})
