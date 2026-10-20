interface IssueSummary {
  number: number
  title: string
}

function guessLabel(title: string) {
  if (/crash|error|fail|broken/i.test(title)) {
    return 'bug'
  }

  if (/^how\b|\?$/i.test(title)) {
    return 'question'
  }

  return 'feature'
}

/**
 * The run input for one issue. `mock` scripts the replies of `provider: 'mock'`, so the example
 * runs without an API key. Real providers never receive it: switch the provider in
 * `server/agents/triage.md` and the agent decides for itself.
 */
export function triageInput({ number, title }: IssueSummary) {
  const label = guessLabel(title)

  return {
    issue: number,
    mock: {
      turns: [
        {
          calls: [
            {
              name: 'lookup_issue',
              input: { number },
            },
          ],
        },
        {
          calls: [
            {
              name: 'search_issues',
              input: {
                query: title,
                exclude: number,
              },
            },
          ],
        },
        {
          calls: [
            {
              name: 'add_labels',
              input: {
                number,
                labels: [label],
              },
            },
          ],
        },
        {
          text: `I proposed the "${label}" label for #${number}. It waits for a maintainer's approval. This answer is scripted by the mock provider.`,
        },
      ],
    },
  }
}
