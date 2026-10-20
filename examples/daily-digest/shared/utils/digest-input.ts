const DAY = 24 * 60 * 60 * 1000

/**
 * The run input for a digest of the last 24 hours. `mock` scripts the replies of
 * `provider: 'mock'`, so the example runs without an API key. Real providers never receive it:
 * switch the provider in `server/agents/digest.md` to get written digests.
 */
export function digestInput(now = new Date()) {
  const since = new Date(now.getTime() - DAY).toISOString()

  return {
    since,
    mock: {
      turns: [
        {
          calls: [
            {
              name: 'list_activity',
              input: { since },
            },
          ],
        },
        {
          calls: [
            {
              name: 'list_review_queue',
              input: {},
            },
          ],
        },
        {
          text: [
            'v2.4.0 shipped with faster cold starts.',
            '',
            'Shipped',
            '- This digest is scripted by the mock provider.',
            '- Open the tool steps to see the activity a real model would summarize.',
          ].join('\n'),
        },
      ],
    },
  }
}
