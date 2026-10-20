import { useRuntimeConfig } from 'nuxt/app'
import type { AgentName, UseAgentReturn } from '@nuxtagentic/nuxt/types'
import { createAgentRun } from './agent-run'

/**
 * Run the agent defined in `server/agents/<name>.md`.
 *
 * Every `run()` clears `messages` and starts over. `stop()` aborts the current run.
 */
export function useAgent(name: AgentName): UseAgentReturn {
  const { runPath } = useRuntimeConfig().public.agentic

  return createAgentRun(name, { runPath })
}
