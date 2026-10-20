import { Validator } from '@cfworker/json-schema'
import type { AgentInvocation, RunnableTool } from './runtime'
import type { ProviderToolCall } from './providers'

/** One validation and receipt identity policy for API and local model turns. */
export async function callAgentTool(
  options: AgentInvocation,
  tools: RunnableTool[],
  { name, input }: ProviderToolCall,
  callId: string,
) {
  const tool = tools.find((entry) => entry.name === name)

  if (!tool) {
    throw new Error('The agent requested a tool it has not been granted.')
  }

  const validation = new Validator(tool.parameters).validate(input)

  if (!validation.valid) {
    throw new Error(
      `Invalid arguments for tool ${name}: ${validation.errors.map(({ error }) => error).join('; ')}`,
    )
  }

  return options.callTool(name, input, {
    callId,
    idempotencyKey: `agent-${options.runId ?? 'local'}-${callId}`,
    ...(options.signal ? { signal: options.signal } : {}),
  })
}
