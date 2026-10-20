import { z } from 'zod'

export default defineAgentTool({
  name: 'fetch_page',
  description: 'Download a web page and return its title and readable text.',
  input: z.object({ url: z.url().describe('Absolute HTTPS address of the page') }),
  handler: ({ url }, { signal }) =>
    fetchPageText(url, useRuntimeConfig().public.allowedHosts, signal),
})
