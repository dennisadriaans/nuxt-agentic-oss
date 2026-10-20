import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import type { AgentRunEvent } from '@nuxtagentic/nuxt'
import { digestInput } from '../shared/utils/digest-input'

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

async function assertDigestRun(origin: string) {
  const page = await fetch(origin)

  assert.match(await page.text(), /Daily digest/)

  const response = await fetch(`${origin}/api/_agentic/run/digest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: digestInput() }),
  })
  const events = (await response.text())
    .split('\n\n')
    .filter(Boolean)
    .map((block) => JSON.parse(block.match(/^data: (.+)$/m)![1]!) as AgentRunEvent)

  assert.deepEqual(
    events.map(({ type }) => type),
    ['start', 'tool', 'tool-result', 'tool', 'tool-result', 'message'],
  )
  const [, , activity, , reviews] = events

  assert.ok(activity?.type === 'tool-result' && Array.isArray(activity.output))
  assert.equal(activity.output.length, 5, 'only the last 24 hours')
  assert.ok(reviews?.type === 'tool-result')
  assert.deepEqual(
    (reviews.output as { number: number }[]).map(({ number }) => number),
    [412, 418],
  )
}

test('the example runs on a node-server build', { timeout: 400000 }, async () => {
  await build('node-server')
  const stop = await serve('node', ['.output/server/index.mjs'], 'http://localhost:4803', {
    PORT: '4803',
  })

  try {
    await assertDigestRun('http://localhost:4803')
    assert.equal(await (await fetch('http://localhost:4803/api/digest')).text(), '')
  } finally {
    stop()
  }
})

test(
  'the example runs and its cron trigger writes a digest in workerd',
  { timeout: 400000 },
  async () => {
    await build('cloudflare-module')
    await rm(join(root, '.wrangler/state'), {
      recursive: true,
      force: true,
    })
    const { triggers } = JSON.parse(
      await readFile(join(root, '.output/server/wrangler.json'), 'utf8'),
    ) as { triggers?: { crons?: string[] } }

    assert.deepEqual(triggers?.crons, ['0 7 * * *'])
    const stop = await serve(
      bin('wrangler'),
      ['dev', '--cwd', '.output', '--port', '8803', '--inspector-port', '0', '--test-scheduled'],
      'http://localhost:8803',
    )

    try {
      await assertDigestRun('http://localhost:8803')
      const scheduled = await fetch('http://localhost:8803/__scheduled?cron=0+7+*+*+*')

      assert.equal(scheduled.status, 200)
      let digest: { text: string; createdAt: string } | null = null

      for (let attempt = 0; !digest && attempt < 50; attempt++) {
        await delay(100)
        const response = await fetch('http://localhost:8803/api/digest')

        digest = (await response.json().catch(() => null)) as typeof digest
      }

      assert.match(digest?.text ?? '', /^v2\.4\.0 shipped/, 'the cron trigger stores a digest')
    } finally {
      stop()
    }
  },
)
