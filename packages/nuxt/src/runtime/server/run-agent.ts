import {
  agentName,
  createAgentDefinition,
  parseAgentMarkdown,
  type AgentDefinition,
} from '@nuxtagentic/engine'
import { runSavedAgent } from '@nuxtagentic/engine/runtime'
import type { AgentRunHost, AgentRunSession, AgentToolDescription } from '../../host'
import type { AgentRunEvent, RecordedAgentRun } from '../../types'

/** A Markdown agent from `server/agents/<name>.md`. */
export interface AgentSource {
  name: string
  source: string
}

export interface ParsedAgent {
  name: string
  title: string
  definition: AgentDefinition
}

export interface AgentRunOptions<Tool> {
  runId: string
  agent: ParsedAgent
  input: unknown
  tools: readonly Tool[]
  host: AgentRunHost<Tool>
  session: AgentRunSession<Tool>
  signal: AbortSignal
  emit(event: AgentRunEvent): void
  fetch?: typeof fetch
}

/** How a run ended, as recorded for the DevTools tab. */
export type AgentRunOutcome = Exclude<RecordedAgentRun['status'], 'running'>

const MODEL_CALL_TIMEOUT_MS = 120_000

/**
 * Parse every agent against the registered tools.
 *
 * Tools start disabled, so an agent's frontmatter enables them by name.
 *
 * @throws When an agent is invalid, naming its `server/agents/<name>.md` file.
 */
export function parseAgents(
  sources: readonly AgentSource[],
  tools: readonly AgentToolDescription[],
): ParsedAgent[] {
  const declarations = tools.map(({ name, description }) => ({
    id: name,
    name,
    description,
    enabled: false,
    parameters: [],
  }))

  return sources.map(({ name, source }) => {
    try {
      const definition = parseAgentMarkdown(source, {
        ...createAgentDefinition(),
        status: 'active',
        tools: declarations,
      })

      return {
        name,
        title: agentName(definition.markdown),
        definition,
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Invalid agent.'

      throw new Error(`server/agents/${name}.md: ${message}`, { cause })
    }
  })
}

/** Strip the `mock` script from input sent to real providers; only the mock provider reads it. */
function providerPayload(input: unknown, provider: string) {
  if (provider === 'mock' || !input || typeof input !== 'object' || !('mock' in input)) {
    return input
  }

  const { mock: _script, ...rest } = input as Record<string, unknown>

  return rest
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : 'The run failed.'
}

/**
 * Run one agent to completion and report each step through `emit`. Tool failures go back to the
 * model so it can recover; tools that need approval are reported and never run.
 */
export async function runAgent<Tool>(options: AgentRunOptions<Tool>): Promise<AgentRunOutcome> {
  const { runId, agent, input, host, session, signal, emit } = options
  const enabled = new Set(
    agent.definition.tools.filter((tool) => tool.enabled).map((tool) => tool.name),
  )
  const granted = new Map(
    options.tools
      .map((tool) => ({
        tool,
        description: host.describeTool(tool),
      }))
      .filter(({ description }) => enabled.has(description.name))
      .map((entry) => [entry.description.name, entry]),
  )

  emit({
    type: 'start',
    runId,
    agent: agent.name,
  })

  try {
    const text = await runSavedAgent({
      agent: agent.definition,
      instructions: 'Respond to the input.',
      payload: providerPayload(input, agent.definition.provider),
      keys: session.keys,
      tools: [...granted.values()].map(({ description: { name, description, parameters } }) => ({
        name,
        description,
        parameters,
      })),
      signal,
      timeoutMs: MODEL_CALL_TIMEOUT_MS,
      runId,
      fetch: options.fetch,
      async callTool(name, toolInput, { callId }) {
        const entry = granted.get(name)

        if (!entry) {
          throw new Error('The agent requested a tool it has not been granted.')
        }

        if (entry.description.approval) {
          emit({
            type: 'approval',
            callId,
            name,
            input: toolInput,
          })

          return {
            approvalRequired: true,
            message: 'This tool needs a person to approve each call, so it did not run.',
          }
        }

        emit({
          type: 'tool',
          callId,
          name,
          input: toolInput,
        })

        try {
          const output = await session.runTool(entry.tool, toolInput, signal)

          emit({
            type: 'tool-result',
            callId,
            name,
            output,
          })

          return output
        } catch (cause) {
          signal.throwIfAborted()
          const message = errorMessage(cause)

          emit({
            type: 'tool-error',
            callId,
            name,
            message,
          })

          return { error: message }
        }
      },
    })

    emit({
      type: 'message',
      text,
    })

    return 'success'
  } catch (cause) {
    if (signal.aborted) {
      return 'stopped'
    }

    emit({
      type: 'error',
      message: errorMessage(cause),
    })

    return 'error'
  }
}
