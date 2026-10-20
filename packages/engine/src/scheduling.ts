import { CronExpressionParser } from 'cron-parser'

export interface AgentSchedule {
  cron: string
  timeZone: string
  payload: Record<string, unknown>
}

/** Five-field cron; the time zone is an IANA name, including DST transitions. */
export function nextAgentSchedule(cron: string, timeZone: string, after = new Date()): Date {
  if (cron.trim().split(/\s+/).length !== 5) {
    throw new Error('Use a five-field cron expression.')
  }

  assertTimeZone(timeZone)

  return CronExpressionParser.parse(cron, {
    tz: timeZone,
    currentDate: after,
  })
    .next()
    .toDate()
}

/** `Intl` throws a `RangeError` for a time zone it does not know. */
function assertTimeZone(timeZone: string) {
  new Intl.DateTimeFormat('en', { timeZone })
}

export interface AgentScope {
  ownerId: string
  workspace: string
  agentId: number
  sessionId: string
}

async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const hash = await crypto.subtle.digest('SHA-256', bytes)

  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Hosts derive this scope from their authenticated session, never from request body fields. */
export async function agentInstanceName(scope: AgentScope): Promise<string> {
  return (
    'agentic-' + (await digest([scope.ownerId, scope.workspace, scope.agentId, scope.sessionId]))
  )
}

/** One durable schedule per stable application key, separate from any run scope. */
export async function scheduleInstanceName(key: string): Promise<string> {
  return 'agentic-schedule-' + (await digest(['schedule', key]))
}
