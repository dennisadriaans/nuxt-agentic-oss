# Nuxt Agentic

Markdown agents and typed tools for Nuxt: write an agent in `server/agents/*.md`, give it tools
from `server/tools/*.ts`, and stream its runs into your UI with `useAgent()`.

```bash
npx nuxi module add @nuxtagentic/nuxt
```

Read the [module documentation](./packages/nuxt/README.md) to get started.

| Package                                       | Description                                            |
| --------------------------------------------- | ------------------------------------------------------ |
| [`@nuxtagentic/nuxt`](./packages/nuxt)        | The Nuxt module: agents, tools, `useAgent()`, DevTools |
| [`@nuxtagentic/engine`](./packages/engine)    | Framework-independent agent definitions and runs       |
| [`@nuxtagentic/cli`](./packages/registry-cli) | Public Pro registry login, status and logout           |

## Examples

- [`daily-digest`](./examples/daily-digest)
- [`issue-triage`](./examples/issue-triage)
- [`page-summarizer`](./examples/page-summarizer)

Each example runs on the mock provider without an API key.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)
# nuxt-agentic-oss
