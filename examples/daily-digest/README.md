# Daily digest

A [Nuxt Agentic](https://nuxtagentic.com) example: a
[Nitro scheduled task](https://nitro.build/guide/tasks) runs a Markdown agent every morning. The
agent reads the team's activity with two tools and writes a short digest, which the page shows.

| File                            | What it shows                                              |
| ------------------------------- | ---------------------------------------------------------- |
| `server/agents/digest.md`       | The agent and its two read-only tools                      |
| `server/tools/list-activity.ts` | A tool with an ISO date-time input                         |
| `server/tasks/digest.ts`        | The scheduled task                                         |
| `server/utils/digest.ts`        | Running the agent from the server and storing the answer   |
| `shared/utils/digest-input.ts`  | One run input shared by the page and the task              |
| `app/app.vue`                   | The latest digest and a live run with `useAgent('digest')` |

## Run it

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000. Select **Write digest** to stream a run, or open
http://localhost:3000/_nitro/tasks/digest to run the scheduled task and reload the page.

The agent uses the `mock` provider, and `shared/utils/digest-input.ts` scripts its replies, so no
API key is needed. To use a real model, edit the frontmatter of `server/agents/digest.md`:

```md
---
provider: 'anthropic'
model: 'claude-sonnet-5-5'
tools: ['list_activity', 'list_review_queue']
---
```

Then set `NUXT_AGENTIC_ANTHROPIC_API_KEY` in `.env` (or the OpenAI or Google key for those
providers). Real providers never receive the `mock` script.

## Scheduling and storage

`nuxt.config.ts` runs the `digest` task at 07:00 UTC with `nitro.scheduledTasks`. On Node the
server runs it in-process; on Cloudflare the same schedule becomes a Cron Trigger in the
generated Wrangler config.

The digest is kept in Nitro storage under `digests`, which is in memory by default. Mount a
persistent driver to keep it across restarts and Worker instances, for example Cloudflare KV:

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  nitro: {
    storage: { digests: { driver: 'cloudflare-kv-binding', binding: 'DIGESTS' } },
  },
})
```

Replace the sample data in `server/utils/activity.ts` with your sources, such as GitHub's events
API. The run endpoint has no authentication; add your own server middleware before deploying.

## Deploy

```bash
NITRO_PRESET=cloudflare-module pnpm build
npx wrangler secret put NUXT_AGENTIC_ANTHROPIC_API_KEY --cwd .output
npx wrangler deploy --cwd .output
```

`pnpm test` builds the example on `node-server` and `cloudflare-module`, and fires the Cron
Trigger in `wrangler dev` to check that a digest is stored.
