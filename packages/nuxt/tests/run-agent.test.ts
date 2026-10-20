import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import { defineAgentTool, type AgentTool } from '../src/tool'
import type { AgentRunHost } from '../src/host'
import type { AgentRunEvent } from '../src/types'
import { parseAgents, runAgent } from '../src/runtime/server/run-agent'

const lookup = defineAgentTool({
  name: 'lookup_issue',
  description: 'Find an issue by number.',
  input: z.object({ number: z.number().int() }),
  handler: ({ number }) => ({
    number,
    title: `Issue ${number}`,
  }),
})

const close = defineAgentTool({
  name: 'close_issue',
  description: 'Close an issue.',
  input: z.object({ number: z.number().int() }),
  approval: true,
  handler: () => {
    throw new Error('Approval tools never run in the free module.')
  },
})

const broken = defineAgentTool({
  name: 'broken',
  description: 'Always fails.',
  input: z.object({}),
  handler: () => {
    throw new Error('Upstream is down.')
  },
})

const host: AgentRunHost<AgentTool> = {
  describeTool: ({ name, description, parameters, approval }) => ({
    name,
    description,
    parameters,
    approval,
  }),
  createSession: async () => ({
    keys: {
      openai: '',
      anthropic: '',
      google: '',
    },
    runTool,
  }),
}

function runTool(tool: AgentTool, input: Record<string, unknown>, signal: AbortSignal) {
  return Promise.resolve(tool.handler(tool.input.parse(input), { signal }))
}

const tools = [lookup, close, broken]
const [triage] = parseAgents(
  [
    {
      name: 'triage',
      source: [
        '---',
        "provider: 'mock'",
        "model: 'mock'",
        "tools: ['lookup_issue', 'close_issue', 'broken']",
        '---',
        '',
        '# Issue triage',
        '',
        'Label new issues.',
      ].join('\n'),
    },
  ],
  tools.map(host.describeTool),
)

async function run(input: unknown, signal = new AbortController().signal) {
  const events: AgentRunEvent[] = []
  const status = await runAgent({
    runId: 'run-1',
    agent: triage!,
    input,
    tools,
    host,
    session: await host.createSession({} as never),
    signal,
    emit: (event) => events.push(event),
  })

  return {
    status,
    events,
  }
}

test('defineAgentTool derives the JSON schema the provider sees', () => {
  assert.deepEqual(lookup.parameters, {
    type: 'object',
    properties: {
      number: {
        type: 'integer',
        minimum: -9007199254740991,
        maximum: 9007199254740991,
      },
    },
    required: ['number'],
  })
  assert.equal(lookup.approval, false)
  assert.throws(
    () =>
      defineAgentTool({
        name: 'bad name',
        description: '',
        input: z.object({}),
        handler() {},
      }),
    /must start with a letter/,
  )
})

test('agents parse their title, provider and enabled tools from Markdown', () => {
  assert.equal(triage!.title, 'Issue triage')
  assert.equal(triage!.definition.provider, 'mock')
  assert.deepEqual(
    triage!.definition.tools.filter((tool) => tool.enabled).map((tool) => tool.name),
    ['lookup_issue', 'close_issue', 'broken'],
  )
  assert.throws(
    () =>
      parseAgents(
        [
          {
            name: 'bad',
            source: "---\ntools: ['missing']\n---\n# Bad",
          },
        ],
        tools.map(host.describeTool),
      ),
    /server\/agents\/bad\.md/,
  )
})

test('the mock provider answers deterministically without tools', async () => {
  const { status, events } = await run('Hello')

  assert.equal(status, 'success')
  assert.deepEqual(events, [
    {
      type: 'start',
      runId: 'run-1',
      agent: 'triage',
    },
    {
      type: 'message',
      text: 'Mock response: "Hello"',
    },
  ])
})

test('tool calls stream their input and output; failures go back to the model', async () => {
  const { status, events } = await run({
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
              name: 'broken',
              input: {},
            },
          ],
        },
        { text: 'Issue 7 is a bug.' },
      ],
    },
  })

  assert.equal(status, 'success')
  assert.deepEqual(
    events.map(({ type }) => type),
    ['start', 'tool', 'tool-result', 'tool', 'tool-error', 'message'],
  )
  assert.deepEqual(events[2], {
    type: 'tool-result',
    callId: '0-0',
    name: 'lookup_issue',
    output: {
      number: 7,
      title: 'Issue 7',
    },
  })
  assert.deepEqual(events[4], {
    type: 'tool-error',
    callId: '1-0',
    name: 'broken',
    message: 'Upstream is down.',
  })
})

test('approval tools are reported and never run', async () => {
  const { status, events } = await run({
    mock: {
      turns: [
        {
          calls: [
            {
              name: 'close_issue',
              input: { number: 7 },
            },
          ],
        },
        { text: 'Asked.' },
      ],
    },
  })

  assert.equal(status, 'success')
  assert.deepEqual(events[1], {
    type: 'approval',
    callId: '0-0',
    name: 'close_issue',
    input: { number: 7 },
  })
})

test('invalid tool arguments and provider failures end the run with an error event', async () => {
  const { status, events } = await run({
    mock: {
      turns: [
        {
          calls: [
            {
              name: 'lookup_issue',
              input: { number: 'seven' },
            },
          ],
        },
      ],
    },
  })

  assert.equal(status, 'error')
  const last = events.at(-1)

  assert.ok(last?.type === 'error' && /Invalid arguments for tool lookup_issue/.test(last.message))
})

test('an aborted run stops without an error event', async () => {
  const controller = new AbortController()

  controller.abort()
  const { status, events } = await run('Hello', controller.signal)

  assert.equal(status, 'stopped')
  assert.deepEqual(
    events.map(({ type }) => type),
    ['start'],
  )
})

test('real providers receive the input without the mock script', async () => {
  const [answer] = parseAgents(
    [
      {
        name: 'answer',
        source: "---\nprovider: 'openai'\nmodel: 'gpt-5'\n---\n# Answer",
      },
    ],
    [],
  )
  const bodies: unknown[] = []
  const events: AgentRunEvent[] = []

  await runAgent({
    runId: 'run-2',
    agent: answer!,
    input: {
      issue: 7,
      mock: { turns: [{ text: 'Scripted.' }] },
    },
    tools: [],
    host,
    session: {
      keys: {
        openai: 'test-key',
        anthropic: '',
        google: '',
      },
      runTool,
    },
    signal: new AbortController().signal,
    emit: (event) => events.push(event),
    fetch: async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)))

      return Response.json({
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: 'Real.',
              },
            ],
          },
        ],
      })
    },
  })
  assert.deepEqual(bodies, [
    {
      model: 'gpt-5',
      instructions: (bodies[0] as { instructions: string }).instructions,
      input: [
        {
          role: 'user',
          content: '{"issue":7}',
        },
      ],
      store: false,
      max_output_tokens: 4096,
    },
  ])
  assert.deepEqual(events.at(-1), {
    type: 'message',
    text: 'Real.',
  })
})
