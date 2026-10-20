import { z } from 'zod'

export default defineAgentTool({
  name: 'list_review_queue',
  description: 'List open pull requests that wait for a review, oldest first.',
  input: z.object({}),
  handler: () =>
    sampleReviewQueue().sort((first, second) => second.waitingDays - first.waitingDays),
})
