# Issue triage

A [Nuxt Agentic](https://nuxtagentic.com) example: a Markdown agent reads an issue, searches for
duplicates and proposes labels. Adding labels needs a maintainer's approval, so the run reports
that call instead of running it.

| File                            | What it shows                                      |
| ------------------------------- | -------------------------------------------------- |
| `server/agents/triage.md`       | The agent: provider, model, enabled tools, prompt  |
| `server/tools/lookup-issue.ts`  | A read-only tool with Zod input and a thrown error |
| `server/tools/search-issues.ts` | A tool that returns ranked matches                 |
| `server/tools/add-labels.ts`    | A tool with `approval: true`                       |
| `app/app.vue`                   | `useAgent('triage')`: run, stop and streamed steps |
| `app/components/AgentRun.vue`   | Tool calls, approvals, errors and the final answer |

## Run it

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000, choose an issue and select **Triage**.

The agent uses the `mock` provider, and `app/utils/triage-input.ts` scripts its replies, so no
API key is needed. To use a real model, edit the frontmatter of `server/agents/triage.md`:

```md
---
provider: 'anthropic'
model: 'claude-sonnet-5-5'
tools: ['lookup_issue', 'search_issues', 'add_labels']
---
```

Then set `NUXT_AGENTIC_ANTHROPIC_API_KEY` in `.env` (or the OpenAI or Google key for those
providers). Real providers
never receive the `mock` script, so the page keeps working unchanged.

## Make it yours

- Replace the sample data in `server/utils/issues.ts` with your tracker's API.
- The run endpoint has no authentication. Add your own server middleware before deploying.
- Approvals that pause and resume a run are part of
  [Nuxt Agentic Pro](https://nuxtagentic.com).

## Deploy

```bash
NITRO_PRESET=cloudflare-module pnpm build
npx wrangler secret put NUXT_AGENTIC_ANTHROPIC_API_KEY --cwd .output
npx wrangler deploy --cwd .output
```

Any [Nitro preset](https://nitro.build/deploy) works; `pnpm test` builds and runs the example on
`node-server` and `cloudflare-module`.
