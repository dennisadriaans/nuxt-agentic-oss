import { z } from 'zod'

export default defineAgentTool({
  name: 'lookup_issue',
  description: 'Read an issue by number: title, body, author and current labels.',
  input: z.object({ number: z.number().int().positive() }),
  handler: ({ number }) => {
    const issue = findIssue(number)

    if (!issue) {
      throw new Error(`Issue #${number} does not exist.`)
    }

    return issue
  },
})
