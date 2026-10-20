import { runSavedAgent, type AgentInvocation, type AgentToolCall } from './runtime'
import { agentInstanceName, type AgentScope } from './scheduling'

export interface AgentRunRequest {
  runId: string
  scope: AgentScope
  payload: unknown
  instructions: string
  /** Host context set by the trusted gateway, never by a client. Stored with the run. */
  context?: Record<string, unknown>
}

export interface AgentRunResult {
  runId: string
  status: 'queued' | 'running' | 'waiting' | 'succeeded' | 'failed' | 'cancelled'
  output: string
  error: string
  approvalId?: number
  /** Payloads and receipts expired; this ID remains reserved and cannot execute again. */
  archived?: boolean
}

export type ResolvedAgentInvocation = Omit<
  AgentInvocation,
  'payload' | 'instructions' | 'signal' | 'checkpoint' | 'runId'
>

/**
 * Supplied by the application. `resolve` loads the saved agent, provider keys
 * and currently granted tools for the authenticated scope; it runs again on
 * every resume so revoked permissions apply to the rest of the run.
 */
export interface AgentRunHost<Env> {
  resolve(request: AgentRunRequest, env: Env): Promise<ResolvedAgentInvocation>
  /** Return the approved action's actual result, or an approval-required value while pending. */
  approval?(request: AgentRunRequest, approvalId: number, env: Env): Promise<unknown>
  /** Dispatch an approved action inside the run's cancellable execution scope. */
  approve?(
    request: AgentRunRequest,
    approval: { approvalId: number; signal: AbortSignal },
    env: Env,
  ): Promise<unknown>
  /** Platform schedulers call this when a stored cron schedule is due. */
  scheduled?(payload: Record<string, unknown>, dueAt: string, env: Env): Promise<void>
  /** Replace the provider harness for a run, for example with a local CLI in development. */
  execute?(invocation: AgentInvocation, request: AgentRunRequest, env: Env): Promise<string>
}

/**
 * Declare how saved agents run in this application. The same host serves every
 * deployment target; the framework creates the platform's agent from it.
 */
export function defineAgentHost<Env = Record<string, unknown> | undefined>(
  host: AgentRunHost<Env>,
): AgentRunHost<Env> {
  return host
}

export class AgentApprovalRequired extends Error {
  constructor(readonly approvalId: number) {
    super('The owner must approve this action in Integrations.')
    this.name = 'AgentApprovalRequired'
  }
}

/** Trusted host policy can cancel a child when its persisted parent has already stopped. */
export class AgentRunCancelled extends Error {}

export interface StoredAgentRun {
  request: AgentRunRequest
  /** The definition and tools accepted at start; a run never switches definitions. */
  snapshot: Pick<AgentInvocation, 'agent' | 'tools'>
  result: AgentRunResult
}

export type AgentReceipt = (
  | { status: 'started' }
  | { status: 'approval'; approvalId: number }
  | { status: 'completed'; value: unknown }
) & {
  /** Saved before dispatch. Older receipts without a tool name remain ambiguous. */
  toolName?: string
}

/**
 * Durable state for one scope's runs. Implement it on any store with
 * read-your-writes consistency: Durable Object SQLite, D1, DynamoDB, Cosmos DB.
 */
export interface AgentRunStore {
  run(runId: string): Promise<StoredAgentRun | null>
  /** Insert unless the run exists; a run ID is an idempotency key. */
  insert(run: StoredAgentRun): Promise<void>
  /** The first terminal result wins; concurrent work must not overwrite completion or cancellation. */
  update(result: AgentRunResult): Promise<void>
  receipt(runId: string, name: string): Promise<AgentReceipt | null>
  setReceipt(runId: string, name: string, receipt: AgentReceipt): Promise<void>
}

export interface AgentRunnerOptions<Env> {
  host: AgentRunHost<Env>
  store: AgentRunStore
  env: Env
  /** Continue a run outside the accepting request: an alarm, queue message or waitUntil. */
  dispatch(runId: string): Promise<void> | void
  /** Fresh deadline per model call. */
  timeoutMs?: number
  /** Bound new model/tool calls per durable activity; completed receipts replay without consuming this budget. */
  maxSteps?: number
  /** Deadline for this execution segment, rather than the lifetime of a durable run. */
  signal?: AbortSignal
}

export interface AgentRunner {
  start(request: AgentRunRequest): Promise<AgentRunResult>
  status(runId: string): Promise<AgentRunResult | null>
  /** Execute or continue a run. Concurrent calls for one run in this process are ignored. */
  resume(runId: string): Promise<void>
  cancel(runId: string): Promise<AgentRunResult | null>
  approve(runId: string, approvalId: number): Promise<AgentApprovalResult>
}

export type AgentApprovalResult =
  | { status: 'completed'; result: unknown }
  | { status: 'cancelled' | 'unavailable'; error: string }
  | { status: 'failed'; error: string }

export function isAgentRunFinished(status: AgentRunResult['status']) {
  return ['succeeded', 'failed', 'cancelled'].includes(status)
}

const RUN_ID = /^[a-zA-Z0-9_-]{1,100}$/
const CANCELLED = 'This run was cancelled.'
const NOT_WAITING = 'This run is no longer waiting for that approval.'

function withoutApproval({ approvalId: _approvalId, ...result }: AgentRunResult): AgentRunResult {
  return result
}

/** The status and error a run ends with when execution throws. */
function interruptedResult(cause: unknown): Partial<AgentRunResult> {
  if (cause instanceof AgentRunCancelled) {
    return {
      status: 'cancelled',
      error: '',
    }
  }

  if (cause instanceof AgentRunYield) {
    return {
      status: 'queued',
      error: '',
    }
  }

  const error = cause instanceof Error ? cause.message : 'Agent execution failed.'

  if (cause instanceof AgentApprovalRequired) {
    return {
      status: 'waiting',
      error,
      approvalId: cause.approvalId,
    }
  }

  return {
    status: 'failed',
    error,
  }
}

/**
 * Platform-neutral durable run state machine. Model rounds and tool results are
 * receipts, so a resumed run replays them instead of repeating provider or
 * external calls. A crash between dispatching a tool and saving its result is
 * ambiguous; that run fails for review rather than repeating an external write.
 */
export function createAgentRunner<Env>(options: AgentRunnerOptions<Env>): AgentRunner {
  const { host, store, env } = options
  const active = new Map<string, AbortController>()
  const steps = new Map<string, number>()

  /** A run's own cancellation combined with the runner's segment deadline. */
  function runSignal(controller: AbortController) {
    return options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal
  }

  function consumeStep(runId: string): void {
    const used = steps.get(runId) ?? 0

    if (options.maxSteps !== undefined && used >= options.maxSteps) {
      throw new AgentRunYield()
    }

    active.get(runId)?.signal.throwIfAborted()
    options.signal?.throwIfAborted()
    steps.set(runId, used + 1)
  }

  async function checkpoint<T>(runId: string, name: string, callback: () => Promise<T>) {
    const receipt = await store.receipt(runId, name)

    if (receipt?.status === 'completed') {
      return receipt.value as T
    }

    consumeStep(runId)
    const value = await callback()

    await store.setReceipt(runId, name, {
      status: 'completed',
      value,
    })

    return value
  }

  async function callTool(
    {
      request,
      resolved,
    }: {
      request: AgentRunRequest
      resolved: ResolvedAgentInvocation
    },
    name: string,
    input: Record<string, unknown>,
    call: AgentToolCall,
  ) {
    const { runId } = request
    const key = `tool ${call.callId}`
    const receipt = await store.receipt(runId, key)

    if (receipt?.status === 'completed') {
      return receipt.value
    }

    if (receipt?.status === 'approval') {
      if (!host.approval) {
        throw new AgentApprovalRequired(receipt.approvalId)
      }

      consumeStep(runId)
      const value = await host.approval(request, receipt.approvalId, env)

      if (isApproval(value)) {
        throw new AgentApprovalRequired(receipt.approvalId)
      }

      await store.setReceipt(runId, key, {
        status: 'completed',
        value,
        toolName: name,
      })

      return value
    }

    if (receipt) {
      throw new Error(
        'A tool call was interrupted after dispatch. Check its external result before retrying in a new run.',
      )
    }

    if (!resolved.tools.some((tool) => tool.name === name)) {
      throw new Error('This tool is no longer granted to the agent.')
    }

    consumeStep(runId)
    await store.setReceipt(runId, key, {
      status: 'started',
      toolName: name,
    })
    active.get(runId)?.signal.throwIfAborted()
    call.signal?.throwIfAborted()
    const value = await resolved.callTool(name, input, call)

    if (isApproval(value)) {
      await store.setReceipt(runId, key, {
        status: 'approval',
        approvalId: value.approvalId,
        toolName: name,
      })
      throw new AgentApprovalRequired(value.approvalId)
    }

    await store.setReceipt(runId, key, {
      status: 'completed',
      value,
      toolName: name,
    })

    return value
  }

  async function execute({ request, snapshot, result }: StoredAgentRun, signal: AbortSignal) {
    let next: AgentRunResult = {
      ...withoutApproval(result),
      status: 'running',
    }

    await store.update(next)

    try {
      signal.throwIfAborted()
      const resolved = await host.resolve(request, env)

      signal.throwIfAborted()
      const invocation: AgentInvocation = {
        ...resolved,
        ...snapshot,
        runId: `${await agentInstanceName(request.scope)}-${request.runId}`,
        instructions: request.instructions,
        payload: request.payload,
        ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
        signal,
        checkpoint: (name, callback) => checkpoint(request.runId, name, callback),
        callTool: (name, input, call) =>
          callTool(
            {
              request,
              resolved,
            },
            name,
            input,
            {
              ...call,
              signal: call.signal ? AbortSignal.any([signal, call.signal]) : signal,
            },
          ),
      }
      const output = host.execute
        ? await host.execute(invocation, request, env)
        : await runSavedAgent(invocation)

      next = {
        ...next,
        status: 'succeeded',
        output,
        error: '',
      }
    } catch (cause) {
      next = {
        ...next,
        ...interruptedResult(cause),
      }
    }

    await store.update(next)
  }

  async function cancelRun(runId: string) {
    const run = await store.run(runId)

    if (!run || isAgentRunFinished(run.result.status)) {
      return run?.result ?? null
    }

    await store.update({
      ...withoutApproval(run.result),
      status: 'cancelled',
      error: '',
    })
    active.get(runId)?.abort(new Error(CANCELLED))

    return (await store.run(runId))?.result ?? null
  }

  return {
    async start(request) {
      if (typeof request.runId !== 'string' || !RUN_ID.test(request.runId)) {
        throw new Error('Use a valid run ID.')
      }

      const existing = await store.run(request.runId)

      if (existing) {
        return existing.result
      }

      // Resolving checks ownership and tool permissions before accepting the run.
      const { agent, tools } = await host.resolve(request, env)

      await store.insert({
        request,
        snapshot: {
          agent,
          tools,
        },
        result: {
          runId: request.runId,
          status: 'queued',
          output: '',
          error: '',
        },
      })
      await options.dispatch(request.runId)

      return (await store.run(request.runId))!.result
    },
    async status(runId) {
      return (await store.run(runId))?.result ?? null
    },
    async resume(runId) {
      if (active.has(runId)) {
        return
      }

      const controller = new AbortController()

      active.set(runId, controller)
      steps.set(runId, 0)

      try {
        const run = await store.run(runId)

        if (run && !isAgentRunFinished(run.result.status)) {
          await execute(run, runSignal(controller))
        }
      } finally {
        active.delete(runId)
        steps.delete(runId)
      }
    },
    cancel: cancelRun,
    async approve(runId, approvalId) {
      if (active.has(runId)) {
        return {
          status: 'unavailable',
          error: NOT_WAITING,
        }
      }

      const controller = new AbortController()

      active.set(runId, controller)
      let shouldResume = false

      try {
        const run = await store.run(runId)

        if (run?.result.status === 'cancelled') {
          return {
            status: 'cancelled',
            error: CANCELLED,
          }
        }

        if (
          !run ||
          run.result.status !== 'waiting' ||
          run.result.approvalId !== approvalId ||
          !host.approve
        ) {
          return {
            status: 'unavailable',
            error: NOT_WAITING,
          }
        }

        controller.signal.throwIfAborted()
        shouldResume = true
        const result = await host.approve(
          run.request,
          {
            approvalId,
            signal: runSignal(controller),
          },
          env,
        )

        return {
          status: 'completed',
          result,
        }
      } catch (cause) {
        if (cause instanceof AgentRunCancelled) {
          await cancelRun(runId)
        }

        if (controller.signal.aborted) {
          return {
            status: 'cancelled',
            error: CANCELLED,
          }
        }

        return {
          status: 'failed',
          error: cause instanceof Error ? cause.message : 'The approved action failed.',
        }
      } finally {
        active.delete(runId)

        if (shouldResume && (await store.run(runId))?.result.status !== 'cancelled') {
          await options.dispatch(runId)
        }
      }
    },
  }
}

class AgentRunYield extends Error {}

/** Process-local store for development and tests. Runs are lost on restart. */
export function createMemoryAgentRunStore(): AgentRunStore {
  const runs = new Map<string, StoredAgentRun>()
  const receipts = new Map<string, AgentReceipt>()

  return {
    async run(runId) {
      const run = runs.get(runId)

      return run ? structuredClone(run) : null
    },
    async insert(run) {
      if (!runs.has(run.request.runId)) {
        runs.set(run.request.runId, structuredClone(run))
      }
    },
    async update(result) {
      const run = runs.get(result.runId)

      if (run && !isAgentRunFinished(run.result.status)) {
        run.result = structuredClone(result)
      }
    },
    async receipt(runId, name) {
      return receipts.get(`${runId}\n${name}`) ?? null
    },
    async setReceipt(runId, name, receipt) {
      receipts.set(`${runId}\n${name}`, receipt)
    },
  }
}

export function isApproval(
  value: unknown,
): value is { approvalRequired: true; approvalId: number } {
  return (
    !!value &&
    typeof value === 'object' &&
    'approvalRequired' in value &&
    value.approvalRequired === true &&
    'approvalId' in value &&
    typeof value.approvalId === 'number'
  )
}
