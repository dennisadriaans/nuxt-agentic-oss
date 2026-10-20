import type { H3Event } from 'h3'
import type { AgentProviderKeys } from '@nuxtagentic/engine/runtime'

/** What the run endpoint needs to know about a tool exported from `server/tools/`. */
export interface AgentToolDescription {
  name: string
  description: string
  parameters: Record<string, unknown>
  approval: boolean
}

/** Per-request capabilities: provider keys and how a granted tool runs. */
export interface AgentRunSession<Tool> {
  keys: AgentProviderKeys
  runTool(tool: Tool, input: Record<string, unknown>, signal: AbortSignal): Promise<unknown>
}

/**
 * Connects the run endpoint to its host. The module ships a host for `defineAgentTool`; a module
 * that brings its own tools, identity or keys (such as Nuxt Agentic Pro) replaces it.
 */
export interface AgentRunHost<Tool = unknown> {
  /** Tools agents may enable, when the host owns them. Defaults to the `server/tools/` files. */
  tools?(): readonly Tool[]
  describeTool(tool: Tool): AgentToolDescription
  /** Throw an h3 error to refuse the request, for example when nobody is signed in. */
  createSession(event: H3Event): Promise<AgentRunSession<Tool>>
}

export function defineAgentRunHost<Tool>(host: AgentRunHost<Tool>): AgentRunHost<Tool> {
  return host
}
