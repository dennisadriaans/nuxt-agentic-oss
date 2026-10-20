import { z } from 'zod'

export default defineAgentTool({
  name: 'lookup_issue',
  description: 'Find an issue by number.',
  input: z.object({ number: z.number().int() }),
  handler: ({ number }) => ({
    number,
    title: `Crash on start (#${number})`,
  }),
})
