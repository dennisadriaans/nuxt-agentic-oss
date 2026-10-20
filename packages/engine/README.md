# @nuxtagentic/engine

The MIT-licensed execution engine behind Nuxt Agentic. It parses and validates agent
definitions, talks to OpenAI, Anthropic, Google and a deterministic `mock` provider, validates
tool calls, computes schedules and runs agents that can pause and resume. It has no framework or
Cloudflare dependency: the host supplies the run store and a trusted tool dispatcher.

You rarely install it directly. The free `@nuxtagentic/nuxt` module and the Pro server depend
on it. Install it yourself when you run Nuxt Agentic agents outside Nuxt or build your own host:

```sh
pnpm add @nuxtagentic/engine
```

## Reading an Agent File

`parseAgentMarkdown` reads a Markdown agent with its frontmatter and validates it. It throws an
error that names the first problem:

```ts
import { parseAgentMarkdown } from '@nuxtagentic/engine'

const agent = parseAgentMarkdown(`---
provider: 'mock'
model: 'scripted'
---

# Support

Answer questions about customers, clearly and briefly.
`)
```

## Entry Points

Every entry point ships as ESM and CommonJS, so schema tools that load modules with `require`
work too.

| Import                           | What it is                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `@nuxtagentic/engine`            | Definitions, Markdown helpers and tool helpers from the entries below                                             |
| `@nuxtagentic/engine/definition` | `createAgentDefinition`, `validateAgentDefinition`, `agentName` and the `AGENT_*` constants                       |
| `@nuxtagentic/engine/markdown`   | `parseAgentMarkdown` and `serializeAgentMarkdown`                                                                 |
| `@nuxtagentic/engine/tools`      | `agentToolSchema` and `callAgentTool`, which validates input before a tool runs                                   |
| `@nuxtagentic/engine/providers`  | `providerSession`: the wire protocol for each provider, including the mock                                        |
| `@nuxtagentic/engine/runtime`    | `runSavedAgent`: one run of a saved agent with provider keys and tools                                            |
| `@nuxtagentic/engine/runs`       | `createAgentRunner`, `defineAgentHost` and `createMemoryAgentRunStore` for resumable runs that pause for approval |
| `@nuxtagentic/engine/scheduling` | `nextAgentSchedule`, `agentInstanceName` and `scheduleInstanceName`                                               |

## Documentation

- [Concepts](https://nuxtagentic.com/docs/concepts)
- [Agents guide](https://nuxtagentic.com/docs/guides/agents)

## License

[MIT](./LICENSE)
