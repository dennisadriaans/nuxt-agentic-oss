import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAgentRun } from '../src/runtime/app/agent-run'
import type { AgentRunEvent } from '../src/types'

function sse(events: AgentRunEvent[]) {
  return events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('')
}

/** A fetch that streams `body` in small chunks, splitting events and multi-byte characters. */
function streamingFetch(body: string, requests: { url: string; body: unknown }[] = []) {
  const bytes = new TextEncoder().encode(body)

  return (async (url: string, init: RequestInit) => {
    requests.push({
      url,
      body: JSON.parse(String(init.body)),
    })
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += 7) {
          controller.enqueue(bytes.slice(offset, offset + 7))
        }

        controller.close()
      },
    })

    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
  }) as typeof fetch
}

test('a run streams tool steps into messages and resolves with the answer', async () => {
  const requests: { url: string; body: unknown }[] = []
  const agent = createAgentRun('triage', {
    runPath: '/api/_agentic/run',
    fetch: streamingFetch(
      sse([
        {
          type: 'start',
          runId: 'r1',
          agent: 'triage',
        },
        {
          type: 'tool',
          callId: '0-0',
          name: 'lookup_issue',
          input: { number: 7 },
        },
        {
          type: 'tool-result',
          callId: '0-0',
          name: 'lookup_issue',
          output: { title: 'Crash ✓' },
        },
        {
          type: 'approval',
          callId: '1-0',
          name: 'close_issue',
          input: { number: 7 },
        },
        {
          type: 'message',
          text: 'Label: bug ✓',
        },
      ]),
      requests,
    ),
  })

  assert.equal(await agent.run({ number: 7 }), 'Label: bug ✓')
  assert.deepEqual(requests, [
    {
      url: '/api/_agentic/run/triage',
      body: { input: { number: 7 } },
    },
  ])
  assert.equal(agent.status.value, 'success')
  assert.equal(agent.error.value, undefined)
  assert.deepEqual(agent.messages.value, [
    {
      role: 'user',
      content: '{"number":7}',
    },
    {
      role: 'tool',
      callId: '0-0',
      name: 'lookup_issue',
      input: { number: 7 },
      status: 'success',
      output: { title: 'Crash ✓' },
    },
    {
      role: 'tool',
      callId: '1-0',
      name: 'close_issue',
      input: { number: 7 },
      status: 'approval',
    },
    {
      role: 'assistant',
      content: 'Label: bug ✓',
    },
  ])
})

test('an error event and a refused request both end in the error state', async () => {
  const failing = createAgentRun('triage', {
    runPath: '/run',
    fetch: streamingFetch(
      sse([
        {
          type: 'error',
          message: 'Configure the openai API key.',
        },
      ]),
    ),
  })

  assert.equal(await failing.run('Hi'), undefined)
  assert.equal(failing.status.value, 'error')
  assert.equal(failing.error.value, 'Configure the openai API key.')

  const missing = createAgentRun('nope', {
    runPath: '/run',
    fetch: (async () =>
      Response.json({ statusMessage: 'No agent named "nope".' }, { status: 404 })) as typeof fetch,
  })

  assert.equal(await missing.run('Hi'), undefined)
  assert.equal(missing.error.value, 'No agent named "nope".')

  const truncated = createAgentRun('triage', {
    runPath: '/run',
    fetch: streamingFetch(
      sse([
        {
          type: 'start',
          runId: 'r1',
          agent: 'triage',
        },
      ]),
    ),
  })

  await truncated.run('Hi')
  assert.equal(truncated.error.value, 'The run ended without an answer.')
})

test('stop() aborts the request and marks the run as stopped', async () => {
  let signal: AbortSignal | undefined
  const agent = createAgentRun('triage', {
    runPath: '/run',
    fetch: ((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined

      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal?.reason))
      })
    }) as typeof fetch,
  })
  const pending = agent.run('Hi')

  assert.equal(agent.status.value, 'running')
  agent.stop()
  assert.equal(await pending, undefined)
  assert.equal(signal?.aborted, true)
  assert.equal(agent.status.value, 'stopped')
  assert.equal(agent.error.value, undefined)
})
