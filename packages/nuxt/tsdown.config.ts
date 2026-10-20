import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    module: 'src/module.ts',
    tool: 'src/tool.ts',
    host: 'src/host.ts',
    types: 'src/types.ts',
    'runtime/server/run-handler': 'src/runtime/server/run-handler.ts',
    'runtime/server/default-host': 'src/runtime/server/default-host.ts',
    'runtime/server/devtools-handler': 'src/runtime/server/devtools-handler.ts',
    'runtime/server/devtools-page': 'src/runtime/server/devtools-page.ts',
    'runtime/app/use-agent': 'src/runtime/app/use-agent.ts',
  },
  platform: 'neutral',
  format: 'esm',
  // Nuxt types auto-imports by extensionless path, which resolves `.d.ts` but not `.d.mts`.
  fixedExtension: false,
  deps: { neverBundle: [/^node:/, /^#/, /^nitropack/, /^@nuxtagentic\/nuxt\//, 'nuxt', 'vue'] },
  dts: true,
  sourcemap: true,
  clean: true,
})
