import { createAgentDefinition, validateAgentDefinition, type AgentDefinition } from './definition'

/** JSON values in YAML frontmatter keep tool declarations portable and lossless. */
export function serializeAgentMarkdown(agent: AgentDefinition): string {
  const metadata = {
    runtime: agent.runtime ?? 'api',
    local_model: agent.localModel ?? '',
    provider: agent.provider,
    model: agent.model,
    status: agent.status,
    tool_choice: agent.toolChoice,
    tools: agent.tools,
  }

  return [
    '---',
    ...Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
    '---',
    '',
    agent.markdown,
  ].join('\n')
}

/** Frontmatter keys and the definition fields they set. */
const settingFields = {
  runtime: 'runtime',
  local_model: 'localModel',
  provider: 'provider',
  model: 'model',
  status: 'status',
  tool_choice: 'toolChoice',
  tools: 'tools',
} as const satisfies Record<string, keyof AgentDefinition>

type SettingKey = keyof typeof settingFields

const settingKeys = Object.keys(settingFields) as SettingKey[]
const settingLine = new RegExp(`^(${settingKeys.join('|')}):\\s*(.*)$`)
// YAML flow sequences: bare, single- or double-quoted names, as formatters write them.
const flowName = String.raw`(?:[\w-]+|'[\w-]+'|"[\w-]+")`
const flowSequence = new RegExp(
  String.raw`^\[\s*(?:${flowName}\s*(?:,\s*${flowName}\s*)*,?\s*)?\]$`,
)

/** A JSON value, or the YAML subset agent files use: flow sequences of tool names and quoted strings. */
function parseSettingValue(key: SettingKey, raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    if (key !== 'tools') {
      return raw.replace(/^'(.*)'$/, '$1')
    }

    if (!flowSequence.test(raw)) {
      throw new Error('Use a JSON array for tools.')
    }

    return raw
      .slice(1, -1)
      .split(',')
      .map((entry) => entry.trim().replace(/^(['"])(.*)\1$/, '$2'))
      .filter(Boolean)
  }
}

/** Reads the exported frontmatter subset, plus the reference's enabled-name list. */
export function parseAgentMarkdown(
  source: string,
  current = createAgentDefinition(),
): AgentDefinition {
  source = source.replace(/\r\n/g, '\n')
  const agent = {
    ...current,
    markdown: source,
  }
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)

  if (source.startsWith('---\n') && !frontmatter) {
    throw new Error('Close the agent settings with a second --- line.')
  }

  if (frontmatter) {
    agent.markdown = source.slice(frontmatter[0].length).replace(/^\n/, '')
    const values: Partial<Record<SettingKey, unknown>> = {}

    for (const line of frontmatter[1]!.split('\n')) {
      if (!line.trim()) {
        continue
      }

      const [, key, raw] = settingLine.exec(line) ?? []

      if (!key || raw === undefined) {
        throw new Error(
          `Use ${settingKeys.slice(0, -1).join(', ')} or ${settingKeys.at(-1)} in agent settings.`,
        )
      }

      const settingKey = key as SettingKey

      if (settingKey in values) {
        throw new Error(`Use only one ${settingKey} setting.`)
      }

      values[settingKey] = parseSettingValue(settingKey, raw)
    }

    const { tools } = values

    if (Array.isArray(tools) && tools.every((tool) => typeof tool === 'string') && tools.length) {
      const unknown = tools.find((name) => !current.tools.some((tool) => tool.name === name))

      if (unknown) {
        throw new Error(`Unknown tool "${unknown}". Declare a tool before enabling it by name.`)
      }

      values.tools = current.tools.map((tool) => ({
        ...tool,
        enabled: tools.includes(tool.name),
      }))
    }

    for (const key of settingKeys) {
      if (values[key] !== undefined) {
        Object.assign(agent, { [settingFields[key]]: values[key] })
      }
    }
  }

  const issues = validateAgentDefinition({ ...agent })

  if (issues.length) {
    throw new Error(issues[0]!.message)
  }

  return agent
}
