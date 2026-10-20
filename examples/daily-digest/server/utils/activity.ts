export interface Activity {
  kind: 'commit' | 'pull-request' | 'issue' | 'release'
  title: string
  author: string
  at: string
}

const HOUR = 60 * 60 * 1000

/**
 * Sample team activity relative to now. Replace it with your sources, for example GitHub's
 * events API, your issue tracker or a database query.
 */
export function sampleActivity(now = Date.now()): Activity[] {
  const entries: [Activity['kind'], string, string, number][] = [
    ['release', 'v2.4.0: faster cold starts', 'ana', 3],
    ['pull-request', 'Merged: cache route rules per deployment', 'sam', 5],
    ['commit', 'Fix a memory leak in the image proxy', 'lee', 9],
    ['issue', 'Opened: login fails on Safari 18 with passkeys', 'kim', 14],
    ['pull-request', 'Merged: document the new task runner', 'ana', 20],
    ['commit', 'Update dependencies', 'bot', 30],
    ['issue', 'Closed: flaky upload test', 'sam', 40],
  ]

  return entries.map(([kind, title, author, hoursAgo]) => ({
    kind,
    title,
    author,
    at: new Date(now - hoursAgo * HOUR).toISOString(),
  }))
}

/** Open pull requests that wait for a review. */
export function sampleReviewQueue() {
  return [
    {
      number: 412,
      title: 'Stream large exports',
      author: 'lee',
      waitingDays: 3,
    },
    {
      number: 418,
      title: 'Add a dark mode toggle',
      author: 'kim',
      waitingDays: 1,
    },
  ]
}
