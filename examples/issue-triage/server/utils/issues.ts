export interface Issue {
  number: number
  title: string
  body: string
  author: string
  labels: string[]
}

/** Labels the agent may suggest. */
export const issueLabels = ['bug', 'feature', 'docs', 'question', 'duplicate'] as const

/** Sample issues. Replace them with your tracker's API, for example GitHub's REST API. */
export const issues: Issue[] = [
  {
    number: 101,
    title: 'Dev server crashes when a page has no <template>',
    body: 'After upgrading, `nuxt dev` exits with "Cannot read properties of undefined" as soon as I open a page that only has a <script setup> block.',
    author: 'ana',
    labels: [],
  },
  {
    number: 102,
    title: 'Support custom fetch options in useAsyncData',
    body: 'It would help to pass a timeout and retry count per call instead of wrapping $fetch every time.',
    author: 'sam',
    labels: [],
  },
  {
    number: 103,
    title: 'Crash on start with an empty page component',
    body: 'Same stack trace as the dev server crash: a page without a template takes the whole server down.',
    author: 'lee',
    labels: [],
  },
  {
    number: 104,
    title: 'How do I read runtime config in a server task?',
    body: 'The docs show useRuntimeConfig in event handlers, but my scheduled task has no event.',
    author: 'kim',
    labels: [],
  },
]

export function findIssue(number: number) {
  return issues.find((issue) => issue.number === number)
}
