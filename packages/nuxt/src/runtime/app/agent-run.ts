import { readonly, ref, shallowRef } from 'vue'
import type {
  AgentMessage,
  AgentRunEvent,
  AgentRunStatus,
  UseAgentReturn,
} from '@nuxtagentic/nuxt/types'

/** Split a server-sent event stream into the run events it carries. */
async function* readRunEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<AgentRunEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      return
    }

    buffer += decoder.decode(value, { stream: true })
    let boundary = buffer.indexOf('\n\n')

    while (boundary !== -1) {
      const data = buffer
        .slice(0, boundary)
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')

      buffer = buffer.slice(boundary + 2)
      boundary = buffer.indexOf('\n\n')

      if (data) {
        yield JSON.parse(data) as AgentRunEvent
      }
    }
  }
}

async function responseError(response: Response) {
  const body = (await response.json().catch(() => undefined)) as
    { message?: string; statusMessage?: string } | undefined

  return body?.message || body?.statusMessage || `The run failed with status ${response.status}.`
}

/** Reactive state for streamed runs of one agent at `<runPath>/<name>`. */
export function createAgentRun(
  name: string,
  {
    runPath,
    fetch: request = fetch,
  }: {
    runPath: string
    fetch?: typeof fetch
  },
): UseAgentReturn {
  const messages = ref<AgentMessage[]>([])
  const status = ref<AgentRunStatus>('idle')
  const error = ref<string>()
  const controller = shallowRef<AbortController>()

  function updateTool(callId: string, update: Partial<Extract<AgentMessage, { role: 'tool' }>>) {
    const message = messages.value.find((entry) => entry.role === 'tool' && entry.callId === callId)

    if (message) {
      Object.assign(message, update)
    }
  }

  function apply(event: AgentRunEvent) {
    switch (event.type) {
      case 'tool':
      case 'approval': {
        const { callId, name: tool, input } = event
        const toolStatus = event.type === 'tool' ? 'running' : 'approval'

        messages.value.push({
          role: 'tool',
          callId,
          name: tool,
          input,
          status: toolStatus,
        })

        return
      }
      case 'tool-result':
        return updateTool(event.callId, {
          status: 'success',
          output: event.output,
        })
      case 'tool-error':
        return updateTool(event.callId, {
          status: 'error',
          error: event.message,
        })
      case 'message':
        messages.value.push({
          role: 'assistant',
          content: event.text,
        })
        status.value = 'success'

        return
      case 'error':
        error.value = event.message
        status.value = 'error'
    }
  }

  async function run(input: unknown): Promise<string | undefined> {
    stop()
    const current = new AbortController()

    controller.value = current

    const content = typeof input === 'string' ? input : JSON.stringify(input)

    messages.value = [
      {
        role: 'user',
        content,
      },
    ]
    status.value = 'running'
    error.value = undefined

    try {
      const response = await request(`${runPath}/${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ input }),
        signal: current.signal,
      })

      if (!response.ok || !response.body) {
        throw new Error(await responseError(response))
      }

      let answer: string | undefined

      for await (const event of readRunEvents(response.body)) {
        apply(event)

        if (event.type === 'message') {
          answer = event.text
        }
      }

      if (answer === undefined && !error.value) {
        throw new Error('The run ended without an answer.')
      }

      return answer
    } catch (cause) {
      if (current.signal.aborted) {
        return undefined
      }

      error.value = cause instanceof Error ? cause.message : 'The run failed.'
      status.value = 'error'

      return undefined
    } finally {
      if (controller.value === current) {
        controller.value = undefined
      }
    }
  }

  function stop() {
    if (!controller.value) {
      return
    }

    controller.value.abort()
    controller.value = undefined
    status.value = 'stopped'
  }

  return {
    run,
    stop,
    messages: readonly(messages),
    status: readonly(status),
    error: readonly(error),
  }
}
