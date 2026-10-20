import { z } from 'zod'

export default defineAgentTool({
  name: 'close_issue',
  description: 'Close an issue.',
  input: z.object({ number: z.number().int() }),
  approval: true,
  handler: () => ({ closed: true }),
})
