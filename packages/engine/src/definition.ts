export interface ValidationIssue {
  path: string
  message: string
}

export const AGENT_PROVIDERS = ['openai', 'anthropic', 'google', 'mock'] as const

export const AGENT_RUNTIMES = ['api', 'codex', 'claude'] as const

export const AGENT_PARAMETER_TYPES = [
  'string',
  'number',
  'integer',
  'boolean',
  'array',
  'object',
] as const

export const AGENT_TOOL_CHOICES = ['auto', 'required', 'none'] as const

export type AgentProvider = (typeof AGENT_PROVIDERS)[number]

export type AgentRuntime = (typeof AGENT_RUNTIMES)[number]

export type AgentParameterType = (typeof AGENT_PARAMETER_TYPES)[number]

export type AgentToolChoice = (typeof AGENT_TOOL_CHOICES)[number]

export interface AgentParameter {
  name: string
  type: AgentParameterType
  description: string
  required: boolean
}

export interface AgentTool {
  id: string
  name: string
  description: string
  enabled: boolean
  parameters: AgentParameter[]
}

/** Saved instructions and tool declarations; execution is supplied by the host. */
export interface AgentDefinition {
  markdown: string
  provider: AgentProvider
  model: string
  status: 'draft' | 'active'
  toolChoice: AgentToolChoice
  tools: AgentTool[]
  /** Preferred local execution host; deployed hosts use the API provider/model. */
  runtime?: AgentRuntime
  /** Empty selects the CLI's default. Independent of the production API model. */
  localModel?: string
}

export function agentName(markdown: string): string {
  return (markdown.match(/^#\s+(.+)$/m)?.[1] ?? '').replace(/[*`]/g, '').trim() || 'Untitled agent'
}

export function createAgentDefinition(name = 'Untitled agent'): AgentDefinition {
  return {
    markdown: [
      `# ${name.replace(/[\r\n]+/g, ' ').trim() || 'Untitled agent'}`,
      '',
      'What this agent is for, in one line.',
      '',
      '## Scope',
      '',
      'Tasks, inputs and people it handles.',
      '',
      '## Boundaries',
      '',
      '- What it must not do.',
      '- When to hand off to a person.',
      '',
      '## Decision-making',
      '',
      'How it weighs options, resolves ambiguity and escalates.',
      '',
      '## Tool use',
      '',
      'Which tools to call, when, and how to handle errors.',
    ].join('\n'),
    provider: 'anthropic',
    model: 'claude-sonnet-5-5',
    status: 'draft',
    toolChoice: 'auto',
    tools: [],
    runtime: 'api',
    localModel: '',
  }
}

const identifier = /^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function validateAgentDefinition(
  input: Readonly<Record<string, unknown>>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const issue = (path: string, message: string) =>
    issues.push({
      path,
      message,
    })

  if (
    typeof input.markdown !== 'string' ||
    !input.markdown.trim() ||
    input.markdown.length > 100_000
  ) {
    issue('markdown', 'Write instructions between 1 and 100,000 characters.')
  } else if (agentName(input.markdown).length > 200) {
    issue('markdown', 'Use an agent title of 200 characters or fewer.')
  }

  if (!AGENT_PROVIDERS.some((value) => value === input.provider)) {
    issue('provider', 'Choose OpenAI, Anthropic, Google or the mock provider.')
  }

  if (input.runtime !== undefined && !AGENT_RUNTIMES.some((value) => value === input.runtime)) {
    issue('runtime', 'Choose API, Codex CLI or Claude Code.')
  }

  if (
    input.localModel !== undefined &&
    (typeof input.localModel !== 'string' ||
      input.localModel.length > 200 ||
      /[\r\n]/.test(input.localModel))
  ) {
    issue('localModel', 'Use a local model ID of at most 200 characters.')
  }

  if (
    typeof input.model !== 'string' ||
    !input.model.trim() ||
    input.model.length > 200 ||
    /[\r\n]/.test(input.model)
  ) {
    issue('model', 'Enter a model ID between 1 and 200 characters.')
  }

  if (input.status !== 'draft' && input.status !== 'active') {
    issue('status', 'Choose draft or active.')
  }

  if (!AGENT_TOOL_CHOICES.some((value) => value === input.toolChoice)) {
    issue('toolChoice', 'Choose auto, required or none.')
  }

  if (!Array.isArray(input.tools) || input.tools.length > 100) {
    issue('tools', 'Use a list of at most 100 tools.')

    return issues
  }

  const names = new Set<string>()
  const ids = new Set<string>()

  input.tools.forEach((tool: unknown, index: number) => {
    const path = `tools.${index}`

    if (
      !object(tool) ||
      typeof tool.id !== 'string' ||
      !tool.id ||
      ids.has(tool.id) ||
      typeof tool.name !== 'string' ||
      !identifier.test(tool.name) ||
      names.has(tool.name) ||
      typeof tool.description !== 'string' ||
      typeof tool.enabled !== 'boolean' ||
      !Array.isArray(tool.parameters) ||
      tool.parameters.length > 100
    ) {
      issue(
        path,
        'Give each tool a unique ID and name, a description, and a list of parameters. Names use letters, numbers, underscores or hyphens.',
      )

      return
    }

    names.add(tool.name)
    ids.add(tool.id)
    const parameters = new Set<string>()

    tool.parameters.forEach((parameter: unknown, parameterIndex: number) => {
      if (
        !object(parameter) ||
        typeof parameter.name !== 'string' ||
        !identifier.test(parameter.name) ||
        parameters.has(parameter.name) ||
        !AGENT_PARAMETER_TYPES.some((type) => type === parameter.type) ||
        typeof parameter.description !== 'string' ||
        typeof parameter.required !== 'boolean'
      ) {
        issue(
          `${path}.parameters.${parameterIndex}`,
          'Give each parameter a unique name, a supported type, a description and a required flag.',
        )
      } else {
        parameters.add(parameter.name)
      }
    })
  })

  if (
    input.status === 'active' &&
    input.toolChoice === 'required' &&
    !input.tools.some((tool: unknown) => object(tool) && tool.enabled)
  ) {
    issue('toolChoice', 'Enable at least one tool before activating an agent that requires tools.')
  }

  return issues
}
