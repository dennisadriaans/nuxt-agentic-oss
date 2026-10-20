import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import type { AgentRunEvent } from '@nuxtagentic/nuxt'
import { triageInput } from '../app/utils/triage-input'

const execute = promisify(execFile)
const root = resolve(import.meta.dirname, '..')
const bin = (name: string) => join(root, 'node_modules/.bin', name)

async function build(preset: string) {
  await rm(join(root, '.output'), {
    recursive: true,
    force: true,
  })
  await execute(bin('nuxt'), ['build'], {
    cwd: root,
    env: {
      ...process.env,
      NITRO_PRESET: preset,
    },
    timeout: 300000,
  })
}

async function serve(command: string, args: string[], origin: string, env = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: {
      ...process.env,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  let log = ''

  child.stdout.on('data', (chunk) => (log += chunk))
  child.stderr.on('data', (chunk) => (log += chunk))
  const stop = () => child.exitCode === null && process.kill(-child.pid!, 'SIGTERM')

  for (let attempt = 0; attempt < 300; attempt++) {
    if ((await fetch(origin).catch(() => undefined))?.ok) {
      return stop
    }

    if (child.exitCode !== null) {
      break
    }

    await delay(200)
  }

  stop()
  assert.fail(`The server did not start:\n${log}`)
}

async function runTriage(
  origin: string,
  issue: {
    number: number
    title: string
  },
) {
  const response = await fetch(`${origin}/api/_agentic/run/triage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: triageInput(issue) }),
  })

  assert.equal(response.status, 200)

  return (await response.text())
    .split('\n\n')
    .filter(Boolean)
    .map((block) => JSON.parse(block.match(/^data: (.+)$/m)![1]!) as AgentRunEvent)
}

async function assertExample(origin: string) {
  const page = await fetch(origin)

  assert.match(await page.text(), /Issue triage/)
  const issues = (await (await fetch(`${origin}/api/issues`)).json()) as { number: number }[]

  assert.equal(issues.length, 4)

  const events = await runTriage(origin, {
    number: 101,
    title: 'Dev server crashes when a page has no <template>',
  })

  assert.deepEqual(
    events.map(({ type }) => type),
    ['start', 'tool', 'tool-result', 'tool', 'tool-result', 'approval', 'message'],
  )
  const [, , lookup, , search, approval] = events

  assert.ok(lookup?.type === 'tool-result')
  assert.match(JSON.stringify(lookup.output), /Cannot read properties of undefined/)
  assert.ok(search?.type === 'tool-result')
  assert.equal((search.output as { number: number }[])[0]?.number, 103, 'finds the duplicate')
  assert.deepEqual(approval, {
    type: 'approval',
    callId: '2-0',
    name: 'add_labels',
    input: {
      number: 101,
      labels: ['bug'],
    },
  })

  const missing = await runTriage(origin, {
    number: 999,
    title: 'Missing',
  })

  assert.deepEqual(missing[2], {
    type: 'tool-error',
    callId: '0-0',
    name: 'lookup_issue',
    message: 'Issue #999 does not exist.',
  })
}

test('the example runs on a node-server build', { timeout: 400000 }, async () => {
  await build('node-server')
  const stop = await serve('node', ['.output/server/index.mjs'], 'http://localhost:4801', {
    PORT: '4801',
  })

  try {
    await assertExample('http://localhost:4801')
  } finally {
    stop()
  }
})

test('the example runs on a cloudflare-module build in workerd', { timeout: 400000 }, async () => {
  await build('cloudflare-module')
  await rm(join(root, '.wrangler/state'), {
    recursive: true,
    force: true,
  })
  const stop = await serve(
    bin('wrangler'),
    ['dev', '--cwd', '.output', '--port', '8801', '--inspector-port', '0'],
    'http://localhost:8801',
  )

  try {
    await assertExample('http://localhost:8801')
  } finally {
    stop()
  }
})
