import type { Ref } from 'vue'

/**
 * This app's agents. The module augments it in `.nuxt/types/agentic-runs.d.ts` from
 * `server/agents/*.md`, so `useAgent()` only accepts names that exist.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmented by generated types
export interface AgentRegistry {}

/** An agent name: the file name of `server/agents/<name>.md`. */
export type AgentName = AgentRegistry extends Record<'agents', infer Name> ? Name : string

/** One event of a streamed run, sent as a server-sent event of the same `type`. */
export type AgentRunEvent =
  | { type: 'start'; runId: string; agent: string }
  | { type: 'tool'; callId: string; name: string; input: Record<string, unknown> }
  | { type: 'tool-result'; callId: string; name: string; output: unknown }
  | { type: 'tool-error'; callId: string; name: string; message: string }
  | { type: 'approval'; callId: string; name: string; input: Record<string, unknown> }
  | { type: 'message'; text: string }
  | { type: 'error'; message: string }

export type AgentRunStatus = 'idle' | 'running' | 'success' | 'error' | 'stopped'

export type AgentMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string }
  | {
      role: 'tool'
      callId: string
      name: string
      input: Record<string, unknown>
      status: 'running' | 'success' | 'error' | 'approval'
      output?: unknown
      error?: string
    }

export interface UseAgentReturn {
  /** Start a fresh run. Resolves with the final answer, or `undefined` if it failed or stopped. */
  run(input: unknown): Promise<string | undefined>
  /** Cancel the request; the server stops the run. */
  stop(): void
  messages: Readonly<Ref<readonly AgentMessage[]>>
  status: Readonly<Ref<AgentRunStatus>>
  error: Readonly<Ref<string | undefined>>
}

/** A finished or running run, as listed in the DevTools tab. */
export interface RecordedAgentRun {
  runId: string
  agent: string
  input: unknown
  status: Exclude<AgentRunStatus, 'idle'>
  startedAt: string
  finishedAt?: string
  events: AgentRunEvent[]
}

export interface AgentRunsDevtoolsData {
  route: string
  agents: { name: string; title: string; provider: string; model: string; tools: string[] }[]
  tools: { name: string; description: string; approval: boolean }[]
  runs: RecordedAgentRun[]
  error?: string
}

declare module '@nuxt/schema' {
  interface PublicRuntimeConfig {
    agentic: { runPath: string }
  }
}
