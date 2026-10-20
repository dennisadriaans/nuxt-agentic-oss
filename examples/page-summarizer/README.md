# Page summarizer

A [Nuxt Agentic](https://nuxtagentic.com) example: a Markdown agent reads a web page with a
server tool and summarizes it.

| File                          | What it shows                                        |
| ----------------------------- | ---------------------------------------------------- |
| `server/agents/summarize.md`  | An agent that must call a tool first (`tool_choice`) |
| `server/tools/fetch-page.ts`  | A tool that forwards the run's `signal` to `fetch`   |
| `server/utils/page-text.ts`   | Allowed hosts, checked redirects and text extraction |
| `app/app.vue`                 | `useAgent('summarize')` with a URL form              |
| `app/components/AgentRun.vue` | Tool calls, errors and the final answer              |

## Run it

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000, enter a page address and select **Summarize**.

The agent uses the `mock` provider, and `app/utils/summarize-input.ts` scripts its replies, so
no API key is needed: you see the real extracted page text in the `fetch_page` step and a
scripted answer. For real summaries, edit the frontmatter of `server/agents/summarize.md`:

```md
---
provider: 'anthropic'
model: 'claude-sonnet-5-5'
tools: ['fetch_page']
tool_choice: 'required'
---
```

Then set `NUXT_AGENTIC_ANTHROPIC_API_KEY` in `.env` (or the OpenAI or Google key for those
providers). Real providers never receive the `mock` script.

## Allowed hosts

The run endpoint has no authentication, and a tool that fetches any URL would let anyone use
your server to reach internal addresses. `fetch_page` therefore only reads HTTPS pages on the
hosts in `runtimeConfig.public.allowedHosts`, and checks every redirect against the same list.
Change the list in `nuxt.config.ts`. On Node you can also set it at runtime:

```bash
NUXT_PUBLIC_ALLOWED_HOSTS='["nuxt.com","example.com"]' node .output/server/index.mjs
```

Add authentication before you allow broad or private hosts.

## Deploy

```bash
NITRO_PRESET=cloudflare-module pnpm build
npx wrangler secret put NUXT_AGENTIC_ANTHROPIC_API_KEY --cwd .output
npx wrangler deploy --cwd .output
```

Any [Nitro preset](https://nitro.build/deploy) works; `pnpm test` builds and runs the example on
`node-server` and `cloudflare-module`.
