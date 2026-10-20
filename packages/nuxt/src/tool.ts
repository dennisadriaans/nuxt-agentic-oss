import { z } from 'zod'

export interface AgentToolContext {
  /** Aborted when the client disconnects or calls `stop()`. Forward it to external requests. */
  signal?: AbortSignal
}

export interface AgentToolDefinition<
  Input extends z.ZodObject = z.ZodObject,
  Name extends string = string,
> {
  /** Stable tool name the model calls: letters, digits, `_` and `-`. */
  name: Name
  description: string
  input: Input
  /**
   * Hold every call for a person's approval. Nuxt Agentic does not run these tools; the run
   * reports an `approval` event instead. Nuxt Agentic Pro adds the approval flow.
   */
  approval?: boolean
  handler(input: z.output<Input>, context: AgentToolContext): unknown
}

export interface AgentTool<
  Input extends z.ZodObject = z.ZodObject,
  Name extends string = string,
> extends AgentToolDefinition<Input, Name> {
  approval: boolean
  /** JSON Schema of `input`, sent to the model provider. */
  parameters: Record<string, unknown>
}

const toolName = /^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/

/** Define a tool agents can call. Place it in `server/tools/` as the default export. */
export function defineAgentTool<Input extends z.ZodObject, const Name extends string = string>(
  definition: AgentToolDefinition<Input, Name>,
): AgentTool<Input, Name> {
  const { name, input, approval = false } = definition

  if (!toolName.test(name)) {
    throw new Error(
      `Tool name "${name}" must start with a letter or _ and use letters, digits, _ or -.`,
    )
  }

  const { $schema: _dialect, ...parameters } = z.toJSONSchema(input, { io: 'input' })

  return {
    ...definition,
    approval,
    parameters,
  }
}
