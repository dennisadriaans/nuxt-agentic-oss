import { agents as sources, tools as toolFiles } from '#agentic-runs/registry'
import host from '#agentic-runs/host'
import { parseAgents, type ParsedAgent } from './run-agent'

let parsed: Map<string, ParsedAgent> | undefined

/**
 * Registered tools and the parsed agents, parsed once on first use.
 *
 * @throws When an agent file is invalid, on every call until the file is fixed.
 */
export function useAgentRegistry() {
  const tools = host.tools?.() ?? toolFiles

  parsed ??= new Map(
    parseAgents(sources, tools.map(host.describeTool)).map((agent) => [agent.name, agent]),
  )

  return {
    agents: parsed,
    tools,
    host,
  }
}
