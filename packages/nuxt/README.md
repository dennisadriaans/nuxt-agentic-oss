# Nuxt Agentic

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

Markdown agents and typed tools for Nuxt. Write an agent in `server/agents/*.md`, give it tools
from `server/tools/*.ts`, and stream its runs into your UI with `useAgent()`.

- [Examples](https://github.com/nuxtagentic/nuxt-agentic/tree/main/examples)
- [Documentation](https://nuxtagentic.com/docs/getting-started/free)
- [Upgrade to Pro](./docs/upgrade-to-pro.md)

- **Agents are Markdown**: instructions plus a small frontmatter for provider, model and tools.
- **Tools are typed**: `defineAgentTool()` with a Zod input schema, auto-imported on the server.
- **Runs stream**: `POST /api/_agentic/run/:agent` sends each step as a server-sent event.
- **Typed names**: `useAgent('triage')` only accepts agents that exist.
- **OpenAI, Anthropic and Google**, plus a deterministic `mock` provider for tests and demos.
- **DevTools tab** with your agents, tools and the last 50 runs (development only).
- **Any Nitro preset**: tested on `node-server` and `cloudflare-module`.

Install it in any Nuxt 4 app. Runs happen inside the request and nothing is stored. For saved
agents, a dashboard, approvals, automations and integrations, see
[Upgrade to Pro](./docs/upgrade-to-pro.md).

## Setup

```bash
npx nuxi module add @nuxtagentic/nuxt
```

During the release candidate, install the `next` tag: `npx nuxi module add @nuxtagentic/nuxt@next`
or `pnpm add @nuxtagentic/nuxt@next`.

Or install `@nuxtagentic/nuxt` and add it to `modules`:

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['@nuxtagentic/nuxt'],
})
```

Set the key for each provider you use. Runtime config reads them from the environment:

```bash [.env]
NUXT_AGENTIC_OPENAI_API_KEY=sk-...
NUXT_AGENTIC_ANTHROPIC_API_KEY=sk-ant-...
NUXT_AGENTIC_GOOGLE_API_KEY=...
```

## Write an Agent

The file name is the agent name. The first heading is its title; the rest are its instructions.

```md [server/agents/triage.md]
---
provider: 'anthropic'
model: 'claude-sonnet-5-5'
tools: ['lookup_issue']
---

# Issue triage

Look up the issue, then reply with one label: bug, feature or question.
```

| Setting       | Values                                         | Default             |
| ------------- | ---------------------------------------------- | ------------------- |
| `provider`    | `openai`, `anthropic`, `google`, `mock`        | `anthropic`         |
| `model`       | The provider's model ID                        | `claude-sonnet-5-5` |
| `tools`       | Names of tools from `server/tools`             | none                |
| `tool_choice` | `auto`, `required` (call a tool first), `none` | `auto`              |

## Give It Tools

Each file in `server/tools/` default-exports one tool. `defineAgentTool` is auto-imported.

```ts [server/tools/lookup-issue.ts]
import { z } from 'zod'

export default defineAgentTool({
  name: 'lookup_issue',
  description: 'Find a GitHub issue by number.',
  input: z.object({ number: z.number().int() }),
  async handler({ number }, { signal }) {
    return $fetch(`https://api.github.com/repos/nuxt/nuxt/issues/${number}`, { signal })
  },
})
```

The model's arguments are validated against `input` before the handler runs. A handler that
throws sends the error back to the model, so it can try again or explain. `signal` aborts when
the client disconnects.

Tools with `approval: true` never run in the free module. The run reports an `approval` event
and tells the model that a person must approve the call. Pro adds the approval flow.

## Run It From a Page

```vue [app/pages/triage.vue]
<script setup lang="ts">
const { run, stop, messages, status, error } = useAgent('triage')
const issue = ref('')
</script>

<template>
  <form @submit.prevent="run(issue)">
    <input
      v-model="issue"
      aria-label="Issue"
    />
    <button :disabled="status === 'running'">Triage</button>
    <button
      v-if="status === 'running'"
      type="button"
      @click="stop"
    >
      Stop
    </button>
  </form>
  <p v-if="error">{{ error }}</p>
  <p
    v-for="(message, index) in messages"
    :key="index"
  >
    {{ message.role }}: {{ message.role === 'tool' ? message.name : message.content }}
  </p>
</template>
```

| Return     | Description                                                                       |
| ---------- | --------------------------------------------------------------------------------- |
| `run`      | `(input) => Promise<string \| undefined>`: starts a fresh run with any JSON input |
| `messages` | The user input, each tool call with its status and output, and the final answer   |
| `status`   | `'idle'`, `'running'`, `'success'`, `'error'` or `'stopped'`                      |
| `error`    | The failure message, if any                                                       |
| `stop`     | Cancels the request; the server aborts the run and its tools                      |

## Stream Format

`POST /api/_agentic/run/:agent` with `{ "input": ... }` answers with `text/event-stream`. Each
event's name matches the `type` in its JSON data:

| Event         | Data                          |
| ------------- | ----------------------------- |
| `start`       | `{ runId, agent }`            |
| `tool`        | `{ callId, name, input }`     |
| `tool-result` | `{ callId, name, output }`    |
| `tool-error`  | `{ callId, name, message }`   |
| `approval`    | `{ callId, name, input }`     |
| `message`     | `{ text }`: the final answer  |
| `error`       | `{ message }`: the run failed |

The endpoint has no authentication. Protect it with your own server middleware, route rules or
rate limiting before you expose agents that spend API credit or call private tools.

## Test Without a Provider

Use `provider: 'mock'`. Without a script it answers `Mock response: <input as JSON>`. To script
tool calls, send `mock.turns` as the input:

```ts
await run({
  mock: {
    turns: [{ calls: [{ name: 'lookup_issue', input: { number: 7 } }] }, { text: 'bug' }],
  },
})
```

Only the mock provider reads `mock`. Real providers receive the input without it, so a page can
send a demo script next to its real input and keep working after you switch the agent's
provider. The [examples](#examples) work this way.

## Options

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['@nuxtagentic/nuxt'],
  agentic: {
    agentsDir: 'server/agents',
    toolsDir: 'server/tools',
    route: '/api/_agentic',
  },
})
```

| Option      | Default           | Purpose                                              |
| ----------- | ----------------- | ---------------------------------------------------- |
| `agentsDir` | `'server/agents'` | Markdown agents, scanned in the app and layers       |
| `toolsDir`  | `'server/tools'`  | Files with a `defineAgentTool` default export        |
| `route`     | `'/api/_agentic'` | Prefix of the run endpoint `POST <route>/run/:agent` |

Agents and tools in [layers](https://nuxt.com/docs/guide/going-further/layers) are found too.
An app agent replaces a layer agent with the same name.

## Entry Points

| Import                    | What it is                                                           |
| ------------------------- | -------------------------------------------------------------------- |
| `@nuxtagentic/nuxt`       | The Nuxt module, for `modules` in `nuxt.config.ts`                   |
| `@nuxtagentic/nuxt/tool`  | `defineAgentTool` and its types, for imports outside auto-imports    |
| `@nuxtagentic/nuxt/types` | `AgentName`, `AgentMessage`, `AgentRunEvent` and `UseAgentReturn`    |
| `@nuxtagentic/nuxt/host`  | `defineAgentRunHost`, for modules that bring their own tools or keys |

## DevTools

In development, the **Agent runs** tab in [Nuxt DevTools](https://devtools.nuxt.com) lists your
agents and tools, and the last 50 runs with every event. Runs are kept in memory and the tab's
data endpoint only answers requests to `localhost`. Nothing is recorded in production builds.

## Deploy

The run endpoint is a plain h3 handler, so any [Nitro preset](https://nitro.build/deploy) works.
The module's tests build and run it on `node-server` and `cloudflare-module`. On Cloudflare
Workers, store the provider key as a secret:

```bash
NITRO_PRESET=cloudflare-module npx nuxi build
npx wrangler secret put NUXT_AGENTIC_ANTHROPIC_API_KEY --cwd .output
npx wrangler deploy --cwd .output
```

Runs stream for as long as the request lives. Keep agents short, or move long work to a
scheduled task or a queue.

## Examples

Each example runs without an API key on the mock provider and is tested on `node-server` and
`cloudflare-module`:

- [Issue triage](https://github.com/nuxtagentic/nuxt-agentic/tree/main/examples/issue-triage):
  tools, a duplicate search and a tool that needs approval.
- [Page summarizer](https://github.com/nuxtagentic/nuxt-agentic/tree/main/examples/page-summarizer):
  a fetch tool limited to allowed hosts.
- [Daily digest](https://github.com/nuxtagentic/nuxt-agentic/tree/main/examples/daily-digest):
  a Nitro scheduled task that runs an agent every morning.

## Contributing

```bash
pnpm install
pnpm build    # build the module
pnpm test     # unit tests, nuxi typecheck and node-server, workerd and dev-server runs
pnpm --dir examples/issue-triage dev
```

See [CONTRIBUTING.md](https://github.com/nuxtagentic/nuxt-agentic/blob/main/CONTRIBUTING.md).

## License

[MIT](./LICENSE)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/@nuxtagentic/nuxt/latest.svg?style=flat&colorA=020420&colorB=00DC82
[npm-version-href]: https://npmjs.com/package/@nuxtagentic/nuxt
[npm-downloads-src]: https://img.shields.io/npm/dm/@nuxtagentic/nuxt.svg?style=flat&colorA=020420&colorB=00DC82
[npm-downloads-href]: https://npm.chart.dev/@nuxtagentic/nuxt
[license-src]: https://img.shields.io/npm/l/@nuxtagentic/nuxt.svg?style=flat&colorA=020420&colorB=00DC82
[license-href]: https://npmjs.com/package/@nuxtagentic/nuxt
[nuxt-src]: https://img.shields.io/badge/Nuxt-020420?logo=nuxt.js
[nuxt-href]: https://nuxt.com
