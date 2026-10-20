import type { AgentProvider, AgentTool } from './definition'

export { callAgentTool } from './tool-call'

export function agentToolSchema(tool: AgentTool, provider: AgentProvider) {
  const parameters = {
    type: 'object',
    properties: Object.fromEntries(
      tool.parameters.map((parameter) => [
        parameter.name,
        {
          type: parameter.type,
          description: parameter.description,
          ...(parameter.type === 'array' ? { items: { type: 'string' } } : {}),
        },
      ]),
    ),
    required: tool.parameters
      .filter((parameter) => parameter.required)
      .map((parameter) => parameter.name),
    additionalProperties: false,
  }
  const base = {
    name: tool.name,
    description: tool.description,
  }

  switch (provider) {
    case 'openai':
    case 'mock':
      return {
        type: 'function',
        ...base,
        parameters,
        strict: false,
      }
    case 'anthropic':
      return {
        ...base,
        input_schema: parameters,
      }
    case 'google':
      return {
        ...base,
        parametersJsonSchema: parameters,
      }
  }
}
