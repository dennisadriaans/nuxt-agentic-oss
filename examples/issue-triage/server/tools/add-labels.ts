import { z } from 'zod'

export default defineAgentTool({
  name: 'add_labels',
  description: 'Add labels to an issue. A maintainer approves every call.',
  input: z.object({
    number: z.number().int().positive(),
    labels: z.array(z.enum(issueLabels)).min(1),
  }),
  approval: true,
  handler: ({ number, labels }) => {
    const issue = findIssue(number)

    if (!issue) {
      throw new Error(`Issue #${number} does not exist.`)
    }

    issue.labels = [...new Set([...issue.labels, ...labels])]

    return {
      number,
      labels: issue.labels,
    }
  },
})
