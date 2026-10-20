import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'

export default defineAgentTool({
  name: 'search_issues',
  description: 'Search issues by text.',
  input: z.object({ query: z.string() }),
  async handler({ query }, { signal }) {
    await delay(10_000, undefined, { signal })

    return {
      query,
      results: [],
    }
  },
})
