import assert from 'node:assert/strict'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { get } from 'node:http'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import type { AgentRunEvent, AgentRunsDevtoolsData } from '../src/types'

const execute = promisify(execFile)
const packageRoot = resolve(import.meta.dirname, '..')
const fixture = join(packageRoot, 'tests/fixtures/basic')
const nuxt = join(packageRoot, 'node_modules/.bin/nuxt')
const wrangler = join(packageRoot, 'node_modules/.bin/wrangler')

const scriptedRun = {
  input: {
    mock: {
      turns: [
        {
          calls: [
            {
              name: 'lookup_issue',
              input: { number: 7 },
            },
          ],
        },
        {
          calls: [
            {
              name: 'close_issue',
              input: { number: 7 },
            },
          ],
        },
        { text: 'Label: bug' },
      ],
    },
  },
}

async function runAgent(origin: string, agent: string, body: unknown) {
  const response = await fetch(`${origin}/api/_agentic/run/${agent}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  return {
    response,
    events: response.ok ? parseEvents(await response.text()) : [],
  }
}

function parseEvents(stream: string): AgentRunEvent[] {
  return stream
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const type = block.match(/^event: (.+)$/m)?.[1]
      const event = JSON.parse(block.match(/^data: (.+)$/m)?.[1] ?? '') as AgentRunEvent

      assert.equal(event.type, type)

      return event
    })
}

async function assertScriptedRun(origin: string) {
  const { response, events } = await runAgent(origin, 'triage', scriptedRun)

  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /^text\/event-stream/)
  assert.deepEqual(
    events.map(({ type }) => type),
    ['start', 'tool', 'tool-result', 'approval', 'message'],
  )
  assert.deepEqual(events[2], {
    type: 'tool-result',
    callId: '0-0',
    name: 'lookup_issue',
    output: {
      number: 7,
      title: 'Crash on start (#7)',
    },
  })
  assert.deepEqual(events.at(-1), {
    type: 'message',
    text: 'Label: bug',
  })

  const plain = await runAgent(origin, 'triage', { input: 'Hello' })

  assert.deepEqual(plain.events.at(-1), {
    type: 'message',
    text: 'Mock response: "Hello"',
  })

  const missing = await runAgent(origin, 'missing', { input: 'Hello' })

  assert.equal(missing.response.status, 404)
}

/** fetch() drops a custom Host header; a rebinding attacker's browser sends its own. */
function statusWithHost(url: string, host = 'attacker.example') {
  return new Promise<number | undefined>((resolvePromise, reject) => {
    get(url, { headers: { Host: host } }, (response) => {
      response.resume()
      resolvePromise(response.statusCode)
    }).on('error', reject)
  })
}

/** Closing the stream mid-tool aborts the tool's signal, and the run ends as stopped. */
async function assertDisconnectStopsRun(origin: string) {
  const controller = new AbortController()
  const response = await fetch(`${origin}/api/_agentic/run/triage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: {
        mock: {
          turns: [
            {
              calls: [
                {
                  name: 'search_issues',
                  input: { query: 'crash' },
                },
              ],
            },
          ],
        },
      },
    }),
    signal: controller.signal,
  })
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let received = ''

  while (!received.includes('event: tool\n')) {
    const { value } = await reader.read()

    received += decoder.decode(value, { stream: true })
  }

  controller.abort()

  for (let attempt = 0; attempt < 50; attempt++) {
    const { runs } = (await (
      await fetch(`${origin}/__agentic-runs/devtools.json`)
    ).json()) as AgentRunsDevtoolsData

    if (runs[0]?.status === 'stopped') {
      assert.deepEqual(
        runs[0].events.map(({ type }) => type),
        ['start', 'tool'],
      )

      return
    }

    await delay(100)
  }

  assert.fail('The run kept going after the client disconnected.')
}

async function waitForServer(child: ChildProcess, url: string, log: () => string) {
  for (let attempt = 0; attempt < 600; attempt++) {
    if (child.exitCode !== null) {
      assert.fail(`The server exited:\n${log()}`)
    }

    const response = await fetch(url).catch(() => undefined)

    if (response?.ok) {
      return
    }

    await delay(200)
  }

  assert.fail(`The server did not start:\n${log()}`)
}

function start(command: string, args: string[], env: Record<string, string> = {}) {
  const child = spawn(command, args, {
    cwd: fixture,
    env: {
      ...process.env,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  let log = ''

  child.stdout?.on('data', (chunk) => (log += chunk))
  child.stderr?.on('data', (chunk) => (log += chunk))

  return {
    child,
    log: () => log,
    stop: () => {
      if (child.pid && child.exitCode === null) {
        process.kill(-child.pid, 'SIGTERM')
      }
    },
  }
}

async function build(preset: string) {
  await rm(join(fixture, '.output'), {
    recursive: true,
    force: true,
  })
  await execute(nuxt, ['build'], {
    cwd: fixture,
    env: {
      ...process.env,
      NITRO_PRESET: preset,
    },
    timeout: 300000,
  })
}

test(
  'typed agent names and auto-imported tools pass nuxi typecheck',
  { timeout: 300000 },
  async () => {
    await execute(nuxt, ['typecheck'], {
      cwd: fixture,
      timeout: 240000,
    })
  },
)

test('a node-server build streams runs with tools and approvals', { timeout: 400000 }, async () => {
  await build('node-server')
  const server = start('node', ['.output/server/index.mjs'], { PORT: '4791' })

  try {
    await waitForServer(server.child, 'http://localhost:4791/', server.log)
    await assertScriptedRun('http://localhost:4791')
    const devtools = await fetch('http://localhost:4791/__agentic-runs/devtools.json')

    assert.doesNotMatch(devtools.headers.get('content-type') ?? '', /json/, 'DevTools is dev only')
  } finally {
    server.stop()
  }
})

test('a cloudflare-module build streams runs in workerd', { timeout: 400000 }, async () => {
  await build('cloudflare-module')
  await rm(join(fixture, '.wrangler/state'), {
    recursive: true,
    force: true,
  })
  const worker = start(wrangler, [
    'dev',
    '--cwd',
    '.output',
    '--port',
    '8792',
    '--inspector-port',
    '0',
  ])

  try {
    await waitForServer(worker.child, 'http://localhost:8792/', worker.log)
    await assertScriptedRun('http://localhost:8792')
  } finally {
    worker.stop()
  }
})

test(
  'nuxt dev records runs for the DevTools tab, on loopback only',
  { timeout: 300000 },
  async () => {
    const server = start(nuxt, ['dev', '--port', '4792'])

    try {
      await waitForServer(server.child, 'http://localhost:4792/', server.log)
      await assertScriptedRun('http://localhost:4792')
      const response = await fetch('http://localhost:4792/__agentic-runs/devtools.json')
      const data = (await response.json()) as AgentRunsDevtoolsData

      assert.equal(data.route, '/api/_agentic/run')
      assert.deepEqual(data.agents, [
        {
          name: 'triage',
          title: 'Issue triage',
          provider: 'mock',
          model: 'mock',
          tools: ['close_issue', 'lookup_issue', 'search_issues'],
        },
      ])
      assert.deepEqual(
        data.tools.map(({ name, approval }) => ({
          name,
          approval,
        })),
        [
          {
            name: 'close_issue',
            approval: true,
          },
          {
            name: 'lookup_issue',
            approval: false,
          },
          {
            name: 'search_issues',
            approval: false,
          },
        ],
      )
      const [plain, scripted] = data.runs

      assert.equal(plain?.status, 'success')
      assert.equal(scripted?.agent, 'triage')
      assert.deepEqual(scripted?.input, scriptedRun.input)
      assert.equal(scripted?.events.length, 5)

      const page = await fetch('http://localhost:4792/__agentic-runs/devtools')

      assert.match(await page.text(), /<title>Agent runs<\/title>/)
      assert.equal(await statusWithHost('http://localhost:4792/__agentic-runs/devtools.json'), 403)

      await assertDisconnectStopsRun('http://localhost:4792')
    } finally {
      server.stop()
    }
  },
)
