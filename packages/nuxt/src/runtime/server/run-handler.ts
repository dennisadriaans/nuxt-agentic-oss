import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import type { AgentRunEvent } from '../../types'
import { recordRun } from './recorder'
import { useAgentRegistry } from './registry'
import { runAgent } from './run-agent'

const encoder = new TextEncoder()

function serverSentEvent(event: AgentRunEvent) {
  return encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
}

/**
 * `POST <route>/run/:agent` with `{ input }`: runs the agent within this request and streams its
 * steps as server-sent events. Nothing is stored; closing the connection stops the run.
 */
export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'agent') ?? ''
  const { agents, tools, host } = useAgentRegistry()
  const agent = agents.get(name)

  if (!agent) {
    throw createError({
      statusCode: 404,
      statusMessage: `No agent named "${name}".`,
    })
  }

  const body = await readBody<{ input?: unknown } | undefined>(event)
  const input = body?.input ?? ''
  const session = await host.createSession(event)
  const runId = crypto.randomUUID()
  const recorder = import.meta.dev ? recordRun(runId, name, input) : undefined
  const controller = new AbortController()
  const { signal } = controller
  // Node reports a dropped client on the response; Workers cancel the stream instead.
  const { res: nodeResponse } = event.node

  nodeResponse?.once?.('close', () => {
    if (!nodeResponse.writableFinished) {
      controller.abort()
    }
  })
  let isCancelled = false
  const stream = new ReadableStream<Uint8Array>({
    start(output) {
      const emit = (step: AgentRunEvent) => {
        recorder?.event(step)

        if (!isCancelled) {
          output.enqueue(serverSentEvent(step))
        }
      }

      void runAgent({
        runId,
        agent,
        input,
        tools,
        host,
        session,
        signal,
        emit,
      }).then((status) => {
        recorder?.finish(status)

        if (!isCancelled) {
          output.close()
        }
      })
    },
    cancel() {
      isCancelled = true
      controller.abort()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
})
