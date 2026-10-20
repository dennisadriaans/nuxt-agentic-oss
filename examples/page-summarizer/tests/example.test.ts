import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import type { AgentRunEvent } from '@nuxtagentic/nuxt'
import { summarizeInput } from '../app/utils/summarize-input'
import { extractPageText } from '../server/utils/page-text'

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

async function summarize(origin: string, url: string) {
  const response = await fetch(`${origin}/api/_agentic/run/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: summarizeInput(url) }),
  })

  assert.equal(response.status, 200)

  return (await response.text())
    .split('\n\n')
    .filter(Boolean)
    .map((block) => JSON.parse(block.match(/^data: (.+)$/m)![1]!) as AgentRunEvent)
}

async function assertExample(origin: string) {
  const page = await fetch(origin)

  assert.match(await page.text(), /Page summarizer/)

  for (const url of ['https://attacker.example/', 'http://nuxt.com/', 'https://169.254.169.254/']) {
    const events = await summarize(origin, url)

    assert.deepEqual(
      events.map(({ type }) => type),
      ['start', 'tool', 'tool-error', 'message'],
    )
    const failure = events[2]

    assert.ok(failure?.type === 'tool-error')
    assert.match(failure.message, /^Only HTTPS pages on these hosts can be read: nuxt\.com/)
  }
}

test('page text keeps the main content and drops markup, scripts and navigation', () => {
  const page = extractPageText(`
    <html><head><title>Nuxt &amp; Nitro</title><style>body{}</style></head>
    <body><nav>Menu</nav><main><h1>Deploy</h1><script>track()</script>
    <p>Build once,&nbsp;run on <b>any</b> host &lt;fast&gt;.</p></main><footer>Legal</footer></body></html>`)

  assert.deepEqual(page, {
    title: 'Nuxt & Nitro',
    text: 'Deploy Build once, run on any host <fast>.',
    truncated: false,
  })
  const long = extractPageText(`<body>${'word '.repeat(5000)}</body>`)

  assert.equal(long.text.length, 12_000)
  assert.equal(long.truncated, true)
})

test('the example runs on a node-server build', { timeout: 400000 }, async () => {
  await build('node-server')
  const stop = await serve('node', ['.output/server/index.mjs'], 'http://localhost:4802', {
    PORT: '4802',
  })

  try {
    await assertExample('http://localhost:4802')
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
    ['dev', '--cwd', '.output', '--port', '8802', '--inspector-port', '0'],
    'http://localhost:8802',
  )

  try {
    await assertExample('http://localhost:8802')
  } finally {
    stop()
  }
})
