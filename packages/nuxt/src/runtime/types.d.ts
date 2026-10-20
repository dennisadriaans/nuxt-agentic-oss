declare module '#agentic-runs/registry' {
  export const agents: import('./server/run-agent').AgentSource[]
  export const tools: unknown[]
}

declare module '#agentic-runs/host' {
  const host: import('../host').AgentRunHost

  export default host
}

interface ImportMeta {
  /** Replaced by Nitro: true during `nuxt dev`. */
  readonly dev: boolean
}
