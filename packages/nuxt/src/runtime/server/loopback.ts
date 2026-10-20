import { createError } from 'h3'

const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Reject requests whose `Host` is not loopback.
 *
 * Runs expose inputs and tool output, and checking the host blocks DNS rebinding.
 *
 * @throws 403 when the host is not `localhost`, `127.0.0.1` or `[::1]`.
 */
export function assertLoopback(host: string) {
  const { hostname } = new URL(`http://${host}`)

  if (!loopbackHosts.has(hostname)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Open DevTools from localhost.',
    })
  }
}
