import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    cli: 'src/cli.ts',
    index: 'src/index.ts',
    files: 'src/files.ts',
  },
  platform: 'node',
  format: 'esm',
  fixedExtension: true,
  deps: { neverBundle: [/^node:/] },
  sourcemap: true,
  clean: true,
})
