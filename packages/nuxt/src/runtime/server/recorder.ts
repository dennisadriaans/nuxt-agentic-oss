import type { AgentRunEvent, RecordedAgentRun } from '../../types'

const limit = 50
const runs: RecordedAgentRun[] = []

/** Record a run for the DevTools tab. Keeps the latest 50 in memory, newest first. */
export function recordRun(runId: string, agent: string, input: unknown) {
  const run: RecordedAgentRun = {
    runId,
    agent,
    input,
    status: 'running',
    startedAt: new Date().toISOString(),
    events: [],
  }

  runs.unshift(run)
  runs.length = Math.min(runs.length, limit)

  return {
    event(event: AgentRunEvent) {
      run.events.push(event)
    },
    finish(status: RecordedAgentRun['status']) {
      run.status = status
      run.finishedAt = new Date().toISOString()
    },
  }
}

export function recentRuns(): readonly RecordedAgentRun[] {
  return runs
}
