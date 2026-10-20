import { z } from 'zod'

export default defineAgentTool({
  name: 'list_activity',
  description: 'List commits, merged pull requests, issues and releases since a point in time.',
  input: z.object({ since: z.iso.datetime().describe('ISO 8601 start of the digest period') }),
  handler: ({ since }) => sampleActivity().filter(({ at }) => at >= since),
})
