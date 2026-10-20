import { defineEventHandler, getRequestHost } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import type { AgentRunsDevtoolsData } from '../../types'
import { assertLoopback } from './loopback'
import { recentRuns } from './recorder'
import { useAgentRegistry } from './registry'

/** Data for the DevTools tab. A registry error is returned in the body so recorded runs still show. */
export default defineEventHandler((event): AgentRunsDevtoolsData => {
  assertLoopback(getRequestHost(event))
  const { runPath } = useRuntimeConfig(event).public.agentic
  const runs = [...recentRuns()]

  try {
    const { agents, tools, host } = useAgentRegistry()

    return {
      route: runPath,
      agents: [...agents.values()].map(({ name, title, definition }) => ({
        name,
        title,
        provider: definition.provider,
        model: definition.model,
        tools: definition.tools.filter((tool) => tool.enabled).map((tool) => tool.name),
      })),
      tools: tools.map((tool) => {
        const { name, description, approval } = host.describeTool(tool)

        return {
          name,
          description,
          approval,
        }
      }),
      runs,
    }
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : 'The agent registry failed to load.'

    return {
      route: runPath,
      agents: [],
      tools: [],
      runs,
      error,
    }
  }
})
