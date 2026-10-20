import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAgentDefinition } from '../src/definition'
import { parseAgentMarkdown } from '../src/markdown'
import { createAgentRunner, createMemoryAgentRunStore, type AgentRunHost } from '../src/runs'

test('approval continuation replays model/tool receipts and rechecks grants', async () => {
  const store = createMemoryAgentRunStore()
  let toolCalls = 0
  let modelCalls = 0
  let isApproved = false
  let hasGrant = true
  const host: AgentRunHost<undefined> = {
    async resolve() {
      return {
        agent: createAgentDefinition(),
        keys: {
          openai: '',
          anthropic: '',
          google: '',
        },
        tools: hasGrant
          ? [
              {
                name: 'post',
                description: 'Post',
                parameters: { type: 'object' },
              },
            ]
          : [],
        callTool: async () => {
          toolCalls++

          return {
            approvalRequired: true,
            approvalId: 7,
          }
        },
      }
    },
    async approval() {
      if (!hasGrant) {
        throw new Error('Grant revoked')
      }

      return isApproved
        ? { sent: true }
        : {
            approvalRequired: true,
            approvalId: 7,
          }
    },
    async execute(invocation) {
      await invocation.checkpoint?.('model 0', async () => {
        modelCalls++

        return { requested: true }
      })
      await invocation.callTool(
        'post',
        {},
        {
          callId: 'call-1',
          idempotencyKey: 'run-call-1',
        },
      )

      return 'Delivered'
    },
  }
  const makeRunner = () =>
    createAgentRunner({
      host,
      store,
      env: undefined,
      dispatch() {},
    })
  const request = {
    runId: 'approval-test',
    scope: {
      ownerId: 'owner',
      workspace: 'personal',
      agentId: 1,
      sessionId: 'session',
    },
    payload: {},
    instructions: '',
  }

  await makeRunner().start(request)
  await makeRunner().resume(request.runId)
  assert.equal((await makeRunner().status(request.runId))?.status, 'waiting')
  assert.deepEqual(await store.receipt(request.runId, 'tool call-1'), {
    status: 'approval',
    approvalId: 7,
    toolName: 'post',
  })
  isApproved = true
  await makeRunner().resume(request.runId)
  assert.equal((await makeRunner().status(request.runId))?.output, 'Delivered')
  assert.deepEqual(await store.receipt(request.runId, 'tool call-1'), {
    status: 'completed',
    value: { sent: true },
    toolName: 'post',
  })
  assert.equal(modelCalls, 1)
  assert.equal(toolCalls, 1)
  await makeRunner().start({
    ...request,
    runId: 'revoked-test',
  })
  await makeRunner().resume('revoked-test')
  hasGrant = false
  await makeRunner().resume('revoked-test')
  assert.equal((await makeRunner().status('revoked-test'))?.status, 'failed')
})

test('the tool identity is durable before a dispatch that fails', async () => {
  const store = createMemoryAgentRunStore()
  let dispatches = 0
  const request = {
    runId: 'dispatch-metadata',
    scope: {
      ownerId: 'owner',
      workspace: 'personal',
      agentId: 1,
      sessionId: 'session',
    },
    instructions: '',
    payload: {},
  }
  const host: AgentRunHost<undefined> = {
    async resolve() {
      return {
        agent: createAgentDefinition(),
        tools: [
          {
            name: 'post',
            description: 'Post',
            parameters: { type: 'object' },
          },
        ],
        keys: {
          openai: '',
          anthropic: '',
          google: '',
        },
        async callTool() {
          assert.deepEqual(await store.receipt(request.runId, 'tool first'), {
            status: 'started',
            toolName: 'post',
          })
          dispatches++
          throw new Error('The remote action may have completed.')
        },
      }
    },
    async execute(invocation) {
      await invocation.callTool(
        'post',
        {},
        {
          callId: 'first',
          idempotencyKey: 'dispatch-first',
        },
      )

      return 'Unexpected completion'
    },
  }
  const runner = () =>
    createAgentRunner({
      host,
      store,
      env: undefined,
      dispatch() {},
    })

  await runner().start(request)
  await runner().resume(request.runId)
  assert.equal((await runner().status(request.runId))?.status, 'failed')
  assert.deepEqual(await store.receipt(request.runId, 'tool first'), {
    status: 'started',
    toolName: 'post',
  })
  await runner().resume(request.runId)
  assert.equal(dispatches, 1)
})

test('agent frontmatter accepts formatter-quoted YAML values and tool lists', () => {
  const declarations = ['lookup', 'refund', 'notify'].map((name) => ({
    id: name,
    name,
    description: name,
    enabled: false,
    parameters: [],
  }))
  const agent = parseAgentMarkdown(
    ['---', "provider: 'mock'", 'tools: [\'lookup\', "refund", notify,]', '---', '# Support'].join(
      '\n',
    ),
    {
      ...createAgentDefinition(),
      tools: declarations,
    },
  )

  assert.equal(agent.provider, 'mock')
  assert.deepEqual(
    agent.tools.filter(({ enabled }) => enabled).map(({ name }) => name),
    ['lookup', 'refund', 'notify'],
  )
  assert.throws(
    () => parseAgentMarkdown(['---', "tools: ['lookup", '---'].join('\n'), createAgentDefinition()),
    /JSON array/,
  )
})
