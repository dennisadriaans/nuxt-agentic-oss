import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAgentDefinition } from '../src/definition'
import {
  AgentRunCancelled,
  createAgentRunner,
  createMemoryAgentRunStore,
  type AgentRunHost,
} from '../src/runs'

function deferred<T>() {
  let resolveValue: (value: T) => void = () => {}

  const promise = new Promise<T>((resolve) => {
    resolveValue = resolve
  })

  return {
    promise,
    resolve: (value: T) => resolveValue(value),
  }
}

const request = {
  runId: 'cancellation-fixture',
  scope: {
    ownerId: 'owner',
    workspace: 'personal',
    agentId: 1,
    sessionId: 'session',
  },
  instructions: '',
  payload: {},
}
const tool = {
  name: 'post',
  description: 'Post',
  parameters: { type: 'object' },
}

test('queued cancellation survives recreation and prevents accepting the same run ID again', async () => {
  const store = createMemoryAgentRunStore()
  let executions = 0
  const host: AgentRunHost<undefined> = {
    async resolve() {
      return {
        agent: createAgentDefinition(),
        tools: [],
        keys: {
          openai: '',
          anthropic: '',
          google: '',
        },
        callTool: async () => ({}),
      }
    },
    async execute() {
      executions++

      return 'Unexpected execution'
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
  assert.equal((await runner().cancel(request.runId))?.status, 'cancelled')
  await runner().resume(request.runId)
  assert.equal((await runner().start(request)).status, 'cancelled')
  assert.equal((await runner().cancel(request.runId))?.status, 'cancelled')
  assert.equal(await runner().cancel('missing'), null)
  assert.equal(executions, 0)
})

test('a cancellation racing with committed completion preserves the first terminal result', async () => {
  const store = createMemoryAgentRunStore()
  const host: AgentRunHost<undefined> = {
    async resolve() {
      return {
        agent: createAgentDefinition(),
        tools: [],
        keys: {
          openai: '',
          anthropic: '',
          google: '',
        },
        callTool: async () => ({}),
      }
    },
  }
  const runner = createAgentRunner({
    host,
    store,
    env: undefined,
    dispatch() {},
  })

  await runner.start(request)
  const cancellation = runner.cancel(request.runId)

  await store.update({
    runId: request.runId,
    status: 'succeeded',
    output: 'Committed result',
    error: '',
  })
  assert.equal((await cancellation)?.status, 'succeeded')
  assert.equal((await runner.status(request.runId))?.output, 'Committed result')
})

test('cancellation aborts active execution and a late model result cannot dispatch a tool or overwrite it', async () => {
  const store = createMemoryAgentRunStore()
  const entered = deferred<AbortSignal>()
  const release = deferred<undefined>()
  let writes = 0
  const host: AgentRunHost<undefined> = {
    async resolve() {
      return {
        agent: createAgentDefinition(),
        tools: [tool],
        keys: {
          openai: '',
          anthropic: '',
          google: '',
        },
        callTool: async () => {
          writes++

          return { sent: true }
        },
      }
    },
    async execute(invocation) {
      assert.ok(invocation.signal)
      entered.resolve(invocation.signal)
      await invocation.checkpoint?.('model 0', async () => {
        await release.promise

        return { late: true }
      })
      await invocation.callTool(
        'post',
        {},
        {
          callId: 'first',
          idempotencyKey: 'first',
        },
      )

      return 'A late result'
    },
  }
  const runner = createAgentRunner({
    host,
    store,
    env: undefined,
    dispatch() {},
  })

  await runner.start(request)
  const execution = runner.resume(request.runId)
  const signal = await entered.promise

  assert.equal((await runner.cancel(request.runId))?.status, 'cancelled')
  assert.equal(signal.aborted, true)
  release.resolve(undefined)
  await execution
  assert.equal((await runner.status(request.runId))?.status, 'cancelled')
  assert.deepEqual(await store.receipt(request.runId, 'model 0'), {
    status: 'completed',
    value: { late: true },
  })
  assert.equal(writes, 0)
})

test('a cancelled approval wait cannot be dispatched or resumed by another runner', async () => {
  const store = createMemoryAgentRunStore()
  let writes = 0
  const host: AgentRunHost<undefined> = {
    async resolve() {
      return {
        agent: createAgentDefinition(),
        tools: [tool],
        keys: {
          openai: '',
          anthropic: '',
          google: '',
        },
        callTool: async () => ({
          approvalRequired: true,
          approvalId: 7,
        }),
      }
    },
    async execute(invocation) {
      await invocation.callTool(
        'post',
        {},
        {
          callId: 'first',
          idempotencyKey: 'first',
        },
      )

      return 'Unexpected completion'
    },
    async approve() {
      writes++

      return { sent: true }
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
  assert.equal((await runner().status(request.runId))?.status, 'waiting')
  await runner().cancel(request.runId)
  assert.equal((await runner().approve(request.runId, 7)).status, 'cancelled')
  await runner().resume(request.runId)
  assert.equal((await runner().status(request.runId))?.status, 'cancelled')
  assert.equal(writes, 0)
})

test('an approval being dispatched shares the run cancellation signal', async () => {
  const store = createMemoryAgentRunStore()
  const entered = deferred<AbortSignal>()
  const host: AgentRunHost<undefined> = {
    async resolve() {
      return {
        agent: createAgentDefinition(),
        tools: [tool],
        keys: {
          openai: '',
          anthropic: '',
          google: '',
        },
        callTool: async () => ({
          approvalRequired: true,
          approvalId: 7,
        }),
      }
    },
    async execute(invocation) {
      await invocation.callTool(
        'post',
        {},
        {
          callId: 'first',
          idempotencyKey: 'first',
        },
      )

      return 'Unexpected completion'
    },
    async approve(_request, { signal }) {
      entered.resolve(signal)
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    },
  }
  const runner = createAgentRunner({
    host,
    store,
    env: undefined,
    dispatch() {},
  })

  await runner.start(request)
  await runner.resume(request.runId)
  const approval = runner.approve(request.runId, 7)
  const signal = await entered.promise

  await runner.cancel(request.runId)
  assert.equal(signal.aborted, true)
  assert.equal((await approval).status, 'cancelled')
  assert.equal((await runner.status(request.runId))?.status, 'cancelled')
})

test('custom execution adapters cannot omit the run cancellation signal from their tool calls', async () => {
  const store = createMemoryAgentRunStore()
  const entered = deferred<AbortSignal>()
  const host: AgentRunHost<undefined> = {
    async resolve() {
      return {
        agent: createAgentDefinition(),
        tools: [tool],
        keys: {
          openai: '',
          anthropic: '',
          google: '',
        },
        async callTool(_name, _input, call) {
          assert.ok(call.signal)
          const signal = call.signal

          entered.resolve(signal)
          await new Promise<void>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true })
          })
        },
      }
    },
    async execute(invocation) {
      await invocation.callTool(
        'post',
        {},
        {
          callId: 'first',
          idempotencyKey: 'first',
        },
      )

      return 'Unexpected completion'
    },
  }
  const runner = createAgentRunner({
    host,
    store,
    env: undefined,
    dispatch() {},
  })

  await runner.start(request)
  const execution = runner.resume(request.runId)
  const signal = await entered.promise

  await runner.cancel(request.runId)
  assert.equal(signal.aborted, true)
  await execution
  assert.equal((await runner.status(request.runId))?.status, 'cancelled')
})

test('a persisted host cancellation closes both resumed execution and a pending approval', async () => {
  const store = createMemoryAgentRunStore()
  let isParentCancelled = false
  const host: AgentRunHost<undefined> = {
    async resolve() {
      if (isParentCancelled) {
        throw new AgentRunCancelled('The parent was cancelled.')
      }

      return {
        agent: createAgentDefinition(),
        tools: [tool],
        keys: {
          openai: '',
          anthropic: '',
          google: '',
        },
        callTool: async () => ({
          approvalRequired: true,
          approvalId: 7,
        }),
      }
    },
    async execute(invocation) {
      await invocation.callTool(
        'post',
        {},
        {
          callId: 'first',
          idempotencyKey: 'first',
        },
      )
      throw new Error('A cancelled execution must never reach this point.')
    },
    async approve() {
      throw new AgentRunCancelled('The parent was cancelled.')
    },
  }
  const runner = createAgentRunner({
    host,
    store,
    env: undefined,
    dispatch() {},
  })

  await runner.start(request)
  await runner.resume(request.runId)
  isParentCancelled = true
  await runner.resume(request.runId)
  assert.equal((await runner.status(request.runId))?.status, 'cancelled')
  isParentCancelled = false
  await runner.start({
    ...request,
    runId: 'parent-cancelled-approval',
  })
  await runner.resume('parent-cancelled-approval')
  assert.equal((await runner.approve('parent-cancelled-approval', 7)).status, 'cancelled')
  assert.equal((await runner.status('parent-cancelled-approval'))?.status, 'cancelled')
})
