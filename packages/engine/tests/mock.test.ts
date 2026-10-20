import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAgentDefinition, validateAgentDefinition } from '../src/definition'
import { runSavedAgent, type AgentInvocation } from '../src/runtime'
import type { MockProviderOptions } from '../src/providers'
import { createAgentRunner, createMemoryAgentRunStore } from '../src/runs'

function invocation(overrides: Partial<AgentInvocation> = {}): AgentInvocation {
  return {
    agent: {
      ...createAgentDefinition('Fixture'),
      provider: 'mock',
      model: 'scripted',
    },
    instructions: '',
    payload: { message: 'hello' },
    keys: {
      openai: '',
      anthropic: '',
      google: '',
    },
    tools: [],
    fetch: async () => {
      throw new Error('Mock execution must not access the network.')
    },
    callTool: async () => {
      throw new Error('This fixture has no granted tools.')
    },
    ...overrides,
  }
}

test('mock runs need no key or network and return deterministic text', async () => {
  const request = invocation()

  assert.deepEqual(validateAgentDefinition({ ...request.agent }), [])
  assert.equal(await runSavedAgent(request), 'Mock response: {"message":"hello"}')
  assert.equal(await runSavedAgent(request), 'Mock response: {"message":"hello"}')
})

test('scripted tools use the real grant, validation and receipt identity path', async () => {
  const calls: unknown[] = []
  const mock: MockProviderOptions = {
    turns: [
      {
        calls: [
          {
            id: 'first',
            name: 'summarize',
            input: { count: 2 },
          },
        ],
        text: '',
      },
      {
        calls: [],
        text: 'Two records summarized.',
      },
    ],
  }
  const request = invocation({
    runId: 'mock-run',
    mock,
    tools: [
      {
        name: 'summarize',
        description: 'Summarize selected records',
        parameters: {
          type: 'object',
          properties: { count: { type: 'integer' } },
          required: ['count'],
          additionalProperties: false,
        },
      },
    ],
    callTool: async (name, input, call) => {
      calls.push({
        name,
        input,
        call,
      })

      return { count: input.count }
    },
  })

  assert.equal(await runSavedAgent(request), 'Two records summarized.')
  assert.deepEqual(calls, [
    {
      name: 'summarize',
      input: { count: 2 },
      call: {
        callId: '0-0',
        idempotencyKey: 'agent-mock-run-0-0',
      },
    },
  ])
  assert.equal(mock.turns.length, 2)

  await assert.rejects(
    runSavedAgent({
      ...request,
      tools: [],
    }),
    /has not been granted/,
  )
  await assert.rejects(
    runSavedAgent({
      ...request,
      mock: {
        turns: [
          {
            calls: [
              {
                name: 'summarize',
                input: { count: 'two' },
              },
            ],
            text: '',
          },
        ],
      },
    }),
    /Invalid arguments/,
  )
  assert.equal(calls.length, 1)
})

test('a run payload can script the mock provider, still through the granted tools', async () => {
  const calls: unknown[] = []
  const payload = {
    mock: {
      turns: [
        {
          calls: [
            {
              name: 'summarize',
              input: { count: 3 },
            },
          ],
        },
        { text: 'Three records summarized.' },
      ],
    },
  }
  const request = invocation({
    payload,
    tools: [
      {
        name: 'summarize',
        description: 'Summarize',
        parameters: { type: 'object' },
      },
    ],
    callTool: async (name, input) => {
      calls.push({
        name,
        input,
      })

      return { ok: true }
    },
  })

  assert.equal(await runSavedAgent(request), 'Three records summarized.')
  assert.deepEqual(calls, [
    {
      name: 'summarize',
      input: { count: 3 },
    },
  ])
  await assert.rejects(
    runSavedAgent({
      ...request,
      tools: [],
    }),
    /has not been granted/,
  )
  assert.equal(
    await runSavedAgent(invocation({ payload: { mock: 'no script' } })),
    'Mock response: {"mock":"no script"}',
  )
})

test('mock failures and cancellations propagate without a success fallback', async () => {
  await assert.rejects(runSavedAgent(invocation({ mock: { turns: [] } })), /no turn 1/)
  await assert.rejects(
    runSavedAgent(
      invocation({
        mock: {
          turns: [
            {
              calls: [],
              text: '',
            },
          ],
        },
      }),
    ),
    /did not return a result/,
  )
  const abort = new AbortController()

  abort.abort(new Error('Cancelled fixture'))
  await assert.rejects(runSavedAgent(invocation({ signal: abort.signal })), /Cancelled fixture/)
})

test('mock tools survive an approval wait without repeating the model call or write', async () => {
  const store = createMemoryAgentRunStore()
  let isApproved = false
  let dispatches = 0
  const runner = createAgentRunner({
    env: undefined,
    store,
    dispatch() {},
    host: {
      async resolve() {
        return invocation({
          tools: [
            {
              name: 'post',
              description: 'Post',
              parameters: { type: 'object' },
            },
          ],
          mock: {
            turns: [
              {
                calls: [
                  {
                    name: 'post',
                    input: { message: 'hello' },
                  },
                ],
                text: '',
              },
              {
                calls: [],
                text: 'Posted with approval.',
              },
            ],
          },
          callTool: async () => {
            dispatches++

            return {
              approvalRequired: true,
              approvalId: 7,
            }
          },
        })
      },
      async approval() {
        return isApproved
          ? { posted: true }
          : {
              approvalRequired: true,
              approvalId: 7,
            }
      },
    },
  })

  await runner.start({
    runId: 'approved-mock',
    scope: {
      ownerId: 'owner',
      workspace: 'personal',
      agentId: 1,
      sessionId: 'session',
    },
    instructions: '',
    payload: {},
  })
  await runner.resume('approved-mock')
  assert.equal((await runner.status('approved-mock'))?.status, 'waiting')
  isApproved = true
  await runner.resume('approved-mock')
  assert.equal((await runner.status('approved-mock'))?.output, 'Posted with approval.')
  assert.equal(dispatches, 1)
})
