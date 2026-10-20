import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

test('published entrypoints load through ESM and CommonJS with the same public exports', async () => {
  for (const subpath of Object.keys(manifest.exports).filter((path) => path !== './package.json')) {
    const specifier = `@nuxtagentic/engine${subpath === '.' ? '' : subpath.slice(1)}`
    const imported = await import(specifier)
    const required = require(specifier)

    assert.deepEqual(Object.keys(imported).sort(), Object.keys(required).sort(), specifier)
  }

  const imported = await import('@nuxtagentic/engine')
  const required = require('@nuxtagentic/engine')

  assert.deepEqual(imported.AGENT_PROVIDERS, required.AGENT_PROVIDERS)
  assert.deepEqual(
    imported.createAgentDefinition('Schema fixture'),
    required.createAgentDefinition('Schema fixture'),
  )
})
