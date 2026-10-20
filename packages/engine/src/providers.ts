import type { AgentDefinition, AgentProvider } from './definition'

export type Value = Record<string, unknown>

export const asObject = (value: unknown): Value =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Value) : {}

export const asArray = (value: unknown): Value[] =>
  Array.isArray(value) ? value.map(asObject) : []

export interface RunnableTool {
  name: string
  description: string
  parameters: Record<string, unknown>
}

/** A tool request normalized across providers. `id` is the provider's own call ID. */
export interface ProviderToolCall {
  id?: string
  name: string
  input: Value
}

export interface ProviderTurn {
  calls: ProviderToolCall[]
  text: string
}

/**
 * One provider conversation. The harness owns the loop, checkpoints and tool
 * dispatch; a session only translates between its wire format and turns.
 * `receive` must be deterministic so a checkpointed response replays exactly.
 */
export interface ProviderSession {
  url: string
  headers: Record<string, string>
  body(requireTool: boolean): unknown
  receive(response: Value): ProviderTurn
  reply(results: { call: ProviderToolCall; value: unknown }[]): void
  complete?(): Promise<Value>
}

export interface MockProviderOptions {
  turns: readonly ProviderTurn[]
}

export interface ProviderSessionOptions {
  agent: AgentDefinition
  key: string
  instructions: string
  /** JSON-encoded run input, sent as the first user message. */
  payload: string
  tools: RunnableTool[]
  mock?: MockProviderOptions
}

const MAX_OUTPUT_TOKENS = 4096

function createOpenAISession({ agent, key, instructions, payload, tools }: ProviderSessionOptions) {
  const input: unknown[] = [
    {
      role: 'user',
      content: payload,
    },
  ]

  return {
    url: 'https://api.openai.com/v1/responses',
    headers: { Authorization: `Bearer ${key}` },
    body: (requireTool) => ({
      model: agent.model,
      instructions,
      input,
      store: false,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      ...(tools.length
        ? {
            tools: tools.map((tool) => ({
              type: 'function',
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
              strict: false,
            })),
            tool_choice: requireTool ? 'required' : 'auto',
            parallel_tool_calls: false,
          }
        : {}),
    }),
    receive(response) {
      const output = asArray(response.output)

      input.push(...output)

      return {
        calls: output
          .filter((entry) => entry.type === 'function_call')
          .map((call) => ({
            id: String(call.call_id),
            name: String(call.name),
            input: asObject(JSON.parse(String(call.arguments))),
          })),
        text: output
          .flatMap((entry) => asArray(entry.content))
          .filter((entry) => entry.type === 'output_text')
          .map((entry) => String(entry.text))
          .join('\n'),
      }
    },
    reply(results) {
      for (const { call, value } of results) {
        input.push({
          type: 'function_call_output',
          call_id: call.id,
          output: JSON.stringify(value),
        })
      }
    },
  } satisfies ProviderSession
}

function createAnthropicSession({
  agent,
  key,
  instructions,
  payload,
  tools,
}: ProviderSessionOptions) {
  const messages: unknown[] = [
    {
      role: 'user',
      content: payload,
    },
  ]

  return {
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: (requireTool) => ({
      model: agent.model,
      system: instructions,
      messages,
      max_tokens: MAX_OUTPUT_TOKENS,
      ...(tools.length
        ? {
            tools: tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              input_schema: tool.parameters,
            })),
            tool_choice: {
              type: requireTool ? 'any' : 'auto',
              disable_parallel_tool_use: true,
            },
          }
        : {}),
    }),
    receive(response) {
      const blocks = asArray(response.content)

      messages.push({
        role: 'assistant',
        content: blocks,
      })

      return {
        calls: blocks
          .filter((entry) => entry.type === 'tool_use')
          .map((call) => ({
            id: String(call.id),
            name: String(call.name),
            input: asObject(call.input),
          })),
        text: blocks
          .filter((entry) => entry.type === 'text')
          .map((entry) => String(entry.text))
          .join('\n'),
      }
    },
    reply(results) {
      messages.push({
        role: 'user',
        content: results.map(({ call, value }) => ({
          type: 'tool_result',
          tool_use_id: call.id,
          content: JSON.stringify(value),
        })),
      })
    },
  } satisfies ProviderSession
}

function createGoogleSession({ agent, key, instructions, payload, tools }: ProviderSessionOptions) {
  const contents: unknown[] = [
    {
      role: 'user',
      parts: [{ text: payload }],
    },
  ]

  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(agent.model)}:generateContent`,
    headers: { 'x-goog-api-key': key },
    body: (requireTool) => ({
      systemInstruction: { parts: [{ text: instructions }] },
      contents,
      generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
      ...(tools.length
        ? {
            tools: [
              {
                functionDeclarations: tools.map((tool) => ({
                  name: tool.name,
                  description: tool.description,
                  parametersJsonSchema: tool.parameters,
                })),
              },
            ],
            toolConfig: { functionCallingConfig: { mode: requireTool ? 'ANY' : 'AUTO' } },
          }
        : {}),
    }),
    receive(response) {
      const content = asObject(asArray(response.candidates)[0]?.content)

      // Replay the complete model content, including Gemini thought signatures.
      contents.push(content)
      const parts = asArray(content.parts)

      return {
        calls: parts
          .filter((part) => part.functionCall)
          .map((part) => {
            const call = asObject(part.functionCall)

            return {
              ...(call.id ? { id: String(call.id) } : {}),
              name: String(call.name),
              input: asObject(call.args),
            }
          }),
        text: parts
          .filter((part) => typeof part.text === 'string' && !part.thought)
          .map((part) => String(part.text))
          .join('\n'),
      }
    },
    reply(results) {
      contents.push({
        role: 'user',
        parts: results.map(({ call, value }) => ({
          functionResponse: {
            name: call.name,
            ...(call.id ? { id: call.id } : {}),
            response: { result: value },
          },
        })),
      })
    },
  } satisfies ProviderSession
}

/** A run payload of `{ "mock": { "turns": [...] } }` scripts the mock provider's replies. */
function payloadTurns(payload: string): ProviderTurn[] | undefined {
  let value: unknown

  try {
    value = JSON.parse(payload)
  } catch {
    return undefined
  }

  const { turns } = asObject(asObject(value).mock)

  if (!Array.isArray(turns)) {
    return undefined
  }

  return turns.map((turn) => {
    const { calls, text } = asObject(turn)

    return {
      calls: asArray(calls).map(({ name, input }) => ({
        name: String(name),
        input: asObject(input),
      })),
      text: typeof text === 'string' ? text : '',
    }
  })
}

function createMockSession({ payload, mock }: ProviderSessionOptions): ProviderSession {
  const turns = structuredClone(
    mock?.turns ??
      payloadTurns(payload) ?? [
        {
          calls: [],
          text: `Mock response: ${payload}`,
        },
      ],
  )
  let turnIndex = 0

  return {
    url: '',
    headers: {},
    body: () => null,
    async complete() {
      const turn = turns[turnIndex]

      if (!turn) {
        throw new Error(`The mock provider script has no turn ${turnIndex + 1}.`)
      }

      return {
        calls: turn.calls,
        text: turn.text,
      }
    },
    receive(response) {
      turnIndex++

      return {
        calls: asArray(response.calls).map((call) => ({
          ...(typeof call.id === 'string' ? { id: call.id } : {}),
          name: String(call.name),
          input: asObject(call.input),
        })),
        text: String(response.text ?? ''),
      }
    },
    reply() {},
  }
}

const providers: Record<AgentProvider, (options: ProviderSessionOptions) => ProviderSession> = {
  openai: createOpenAISession,
  anthropic: createAnthropicSession,
  google: createGoogleSession,
  mock: createMockSession,
}

export function providerSession(options: ProviderSessionOptions): ProviderSession {
  return providers[options.agent.provider](options)
}
