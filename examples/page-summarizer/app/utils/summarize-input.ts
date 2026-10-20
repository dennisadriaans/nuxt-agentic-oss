/**
 * The run input for one page. `mock` scripts the replies of `provider: 'mock'`, so the example
 * runs without an API key. Real providers never receive it: switch the provider in
 * `server/agents/summarize.md` to get real summaries.
 */
export function summarizeInput(url: string) {
  return {
    url,
    mock: {
      turns: [
        {
          calls: [
            {
              name: 'fetch_page',
              input: { url },
            },
          ],
        },
        {
          text: `The mock provider read ${url} and scripted this answer.\n\n- Open the fetch_page step to see the extracted text.\n- Set a real provider in server/agents/summarize.md for an actual summary.`,
        },
      ],
    },
  }
}
