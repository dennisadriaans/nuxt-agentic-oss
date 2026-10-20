import { z } from 'zod'

export default defineAgentTool({
  name: 'search_issues',
  description:
    'Find other issues whose title or body share words with the query, to spot duplicates.',
  input: z.object({
    query: z.string().min(1).describe('Keywords from the issue being triaged'),
    exclude: z.number().int().optional().describe('The issue being triaged'),
  }),
  handler: ({ query, exclude }) => {
    const words = query.toLowerCase().match(/[a-z]{4,}/g) ?? []

    return issues
      .filter(({ number }) => number !== exclude)
      .map(({ number, title, body }) => {
        const text = `${title} ${body}`.toLowerCase()

        return {
          number,
          title,
          matches: words.filter((word) => text.includes(word)).length,
        }
      })
      .filter(({ matches }) => matches > 0)
      .sort((first, second) => second.matches - first.matches)
      .slice(0, 3)
  },
})
