import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAgentDefinition } from '../src/definition'
import { providerSession, type ProviderSessionOptions } from '../src/providers'
import { callSignal, runSavedAgent, type AgentInvocation } from '../src/runtime'

const tool = {
  name: 'lookup',
  description: 'Look up a customer',
  parameters: {
    type: 'object',
    properties: { id: { type: 'integer' } },
    required: ['id'],
    additionalProperties: false,
  },
}
const fixtures = [
  {
    provider: 'openai',
    url: 'https://api.openai.com/v1/responses',
    response: {
      output: [
        {
          type: 'function_call',
          call_id: 'call-1',
          name: 'lookup',
          arguments: '{"id":7}',
        },
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: 'Checking',
            },
          ],
        },
      ],
    },
    final: {
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: 'Customer found',
            },
          ],
        },
      ],
    },
    resultField: 'function_call_output',
  },
  {
    provider: 'anthropic',
    url: 'https://api.anthropic.com/v1/messages',
    response: {
      content: [
        {
          type: 'tool_use',
          id: 'call-1',
          name: 'lookup',
          input: { id: 7 },
        },
        {
          type: 'text',
          text: 'Checking',
        },
      ],
    },
    final: {
      content: [
        {
          type: 'text',
          text: 'Customer found',
        },
      ],
    },
    resultField: 'tool_result',
  },
  {
    provider: 'google',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent',
    response: {
      candidates: [
        {
          content: {
            role: 'model',
            parts: [
              {
                thought: true,
                text: 'Private reasoning',
              },
              {
                functionCall: {
                  id: 'call-1',
                  name: 'lookup',
                  args: { id: 7 },
                },
                thoughtSignature: 'keep-me',
              },
              { text: 'Checking' },
            ],
          },
        },
      ],
    },
    final: {
      candidates: [
        {
          content: {
            role: 'model',
            parts: [{ text: 'Customer found' }],
          },
        },
      ],
    },
    resultField: 'functionResponse',
  },
] as const

function invocation(overrides: Partial<AgentInvocation> = {}): AgentInvocation {
  return {
    agent: {
      ...createAgentDefinition(),
      provider: 'openai',
      model: 'test-model',
    },
    instructions: 'Find the customer',
    payload: { customer: 7 },
    keys: {
      openai: 'test-key',
      anthropic: 'test-key',
      google: 'test-key',
    },
    tools: [tool],
    callTool: async () => ({ name: 'Acme' }),
    ...overrides,
  }
}

for (const fixture of fixtures) {
  test(`${fixture.provider} preserves tool identities and conversation across model rounds`, async () => {
    const requests: Record<string, unknown>[] = []
    const output = await runSavedAgent(
      invocation({
        agent: {
          ...createAgentDefinition(),
          provider: fixture.provider,
          model: 'test-model',
          toolChoice: 'required',
        },
        runId: 'provider-flow',
        fetch: async (input, options) => {
          assert.equal(String(input), fixture.url)
          assert.equal(options?.redirect, 'manual')
          requests.push(JSON.parse(String(options?.body)))

          return Response.json(requests.length === 1 ? fixture.response : fixture.final)
        },
        async callTool(name, input, call) {
          assert.equal(name, 'lookup')
          assert.deepEqual(input, { id: 7 })
          assert.equal(call.idempotencyKey, 'agent-provider-flow-0-0')

          return { name: 'Acme' }
        },
      }),
    )

    assert.equal(output, 'Customer found')
    assert.equal(requests.length, 2)
    assert.match(JSON.stringify(requests[1]), new RegExp(fixture.resultField))
    assert.match(JSON.stringify(requests[1]), /call-1/)
    assert.match(JSON.stringify(requests[1]), /Acme/)

    if (fixture.provider === 'google') {
      assert.match(JSON.stringify(requests[1]), /keep-me/)
    }
  })

  test(`${fixture.provider} supports a response without tool declarations`, () => {
    const options: ProviderSessionOptions = {
      agent: {
        ...createAgentDefinition(),
        provider: fixture.provider,
      },
      key: 'test-key',
      instructions: 'Answer',
      payload: '{}',
      tools: [],
    }
    const session = providerSession(options)

    assert.equal(Object.hasOwn(session.body(false) as object, 'tools'), false)
    assert.deepEqual(session.receive(fixture.final), {
      calls: [],
      text: 'Customer found',
    })
  })
}

test('Google tool calls without provider IDs remain valid and omit invented IDs', () => {
  const session = providerSession({
    agent: {
      ...createAgentDefinition(),
      provider: 'google',
    },
    key: 'test-key',
    instructions: '',
    payload: '{}',
    tools: [tool],
  })
  const turn = session.receive({
    candidates: [
      {
        content: {
          parts: [
            {
              functionCall: {
                name: 'lookup',
                args: { id: 7 },
              },
            },
          ],
        },
      },
    ],
  })

  assert.deepEqual(turn.calls, [
    {
      name: 'lookup',
      input: { id: 7 },
    },
  ])
  session.reply([
    {
      call: turn.calls[0]!,
      value: { found: true },
    },
  ])
  assert.doesNotMatch(
    JSON.stringify(session.body(false)),
    /"functionResponse":\{"name":"lookup","id":/,
  )
})

test('a transient provider overload retries without dispatching a tool twice', async () => {
  let requests = 0
  let toolCalls = 0
  const output = await runSavedAgent(
    invocation({
      fetch: async () => {
        requests++

        if (requests === 1) {
          return new Response('overloaded', {
            status: 429,
            headers: { 'retry-after': '0' },
          })
        }

        return Response.json(requests === 2 ? fixtures[0].response : fixtures[0].final)
      },
      async callTool() {
        toolCalls++

        return { found: true }
      },
    }),
  )

  assert.equal(output, 'Customer found')
  assert.equal(requests, 3)
  assert.equal(toolCalls, 1)
})

test('permanent provider failures and excessive retry delays stop immediately', async () => {
  for (const status of [401, 403, 404, 429]) {
    let calls = 0

    await assert.rejects(
      runSavedAgent(
        invocation({
          fetch: async () => {
            calls++

            return new Response('error', {
              status,
              headers: { 'retry-after': '3600' },
            })
          },
        }),
      ),
      new RegExp(`returned ${status}`),
    )
    assert.equal(calls, 1)
  }
})

test('bounded transient retries stop after four attempts', async () => {
  let calls = 0

  await assert.rejects(
    runSavedAgent(
      invocation({
        fetch: async () => {
          calls++

          return new Response('overload', {
            status: 503,
            headers: { 'retry-after': '0' },
          })
        },
      }),
    ),
    /returned 503/,
  )
  assert.equal(calls, 4)
})

test('cancelling during provider backoff stops the run before another request', async () => {
  const cancellation = new AbortController()
  let calls = 0
  const pending = runSavedAgent(
    invocation({
      signal: cancellation.signal,
      fetch: async () => {
        calls++
        setTimeout(() => cancellation.abort(new Error('Customer cancelled')), 5)

        return new Response('overloaded', {
          status: 429,
          headers: { 'retry-after': '5' },
        })
      },
    }),
  )

  await assert.rejects(pending, /Customer cancelled/)
  assert.equal(calls, 1)
})

test('unexpected fetch errors are not retried as connection failures', async () => {
  let calls = 0

  await assert.rejects(
    runSavedAgent(
      invocation({
        fetch: async () => {
          calls++
          throw new Error('Invalid transport configuration')
        },
      }),
    ),
    /Invalid transport configuration/,
  )
  assert.equal(calls, 1)
})

test('missing keys, required tools and empty or oversized model results report useful errors', async () => {
  await assert.rejects(
    runSavedAgent(
      invocation({
        keys: {
          openai: '',
          anthropic: '',
          google: '',
        },
      }),
    ),
    /Configure the openai API key/,
  )
  await assert.rejects(
    runSavedAgent(
      invocation({
        agent: {
          ...createAgentDefinition(),
          toolChoice: 'required',
        },
        tools: [],
      }),
    ),
    /requires a tool/,
  )
  await assert.rejects(
    runSavedAgent(invocation({ fetch: async () => Response.json({ output: [] }) })),
    /did not return a result/,
  )
  await assert.rejects(
    runSavedAgent(invocation({ fetch: async () => new Response('x'.repeat(2_000_001)) })),
    /too large/,
  )
})

test('malformed and ungranted tool calls never reach the customer action', async () => {
  let calls = 0

  for (const call of [
    {
      name: 'delete_all',
      arguments: '{}',
    },
    {
      name: 'lookup',
      arguments: '{"id":"wrong"}',
    },
    {
      name: 'lookup',
      arguments: 'not json',
    },
  ]) {
    await assert.rejects(
      runSavedAgent(
        invocation({
          fetch: async () =>
            Response.json({
              output: [
                {
                  type: 'function_call',
                  call_id: 'bad',
                  ...call,
                },
              ],
            }),
          async callTool() {
            calls++

            return {}
          },
        }),
      ),
    )
  }

  assert.equal(calls, 0)
})

test('the model round limit stops an endless tool conversation', async () => {
  let calls = 0

  await assert.rejects(
    runSavedAgent(
      invocation({
        fetch: async () => Response.json(fixtures[0].response),
        async callTool() {
          calls++

          return {}
        },
      }),
    ),
    /limit of 8 tool rounds/,
  )
  assert.equal(calls, 8)
})

test('per-call timeouts preserve the parent cancellation and refresh between calls', () => {
  assert.equal(callSignal({}), null)
  const parent = new AbortController()

  assert.equal(callSignal({ signal: parent.signal }), parent.signal)
  const first = callSignal({
    signal: parent.signal,
    timeoutMs: 1000,
  })!
  const second = callSignal({
    signal: parent.signal,
    timeoutMs: 1000,
  })!

  assert.notEqual(first, second)
  parent.abort()
  assert.equal(first.aborted, true)
  assert.equal(second.aborted, true)
})
