import { useRuntimeConfig } from 'nitropack/runtime'
import { defineAgentRunHost } from '@nuxtagentic/nuxt/host'
import type { AgentTool } from '@nuxtagentic/nuxt/tool'

function key(config: Record<string, unknown>, name: string) {
  const value = config[name]

  return typeof value === 'string' ? value : ''
}

/** Default host: `defineAgentTool` tools with provider keys from `runtimeConfig.agentic`. */
export default defineAgentRunHost<AgentTool>({
  describeTool: ({ name, description, parameters, approval }) => ({
    name,
    description,
    parameters,
    approval,
  }),
  async createSession(event) {
    const config = (useRuntimeConfig(event).agentic ?? {}) as Record<string, unknown>

    return {
      keys: {
        openai: key(config, 'openaiApiKey'),
        anthropic: key(config, 'anthropicApiKey'),
        google: key(config, 'googleApiKey'),
      },
      runTool: async (tool, input, signal) => tool.handler(tool.input.parse(input), { signal }),
    }
  },
})
