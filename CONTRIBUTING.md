# Contributing

Thanks for helping improve Nuxt Agentic. Bug reports, examples and fixes are welcome.

## Setup

You need Node.js 22.22 or 24.15+ and pnpm 10.

```bash
pnpm install
pnpm build
```

| Path                    | Contents                                                   |
| ----------------------- | ---------------------------------------------------------- |
| `packages/engine`       | `@nuxtagentic/engine`: agent Markdown, providers, run loop |
| `packages/nuxt`         | `@nuxtagentic/nuxt`: the Nuxt module                       |
| `packages/registry-cli` | `@nuxtagentic/cli`: public Pro registry setup              |
| `examples/*`            | Runnable apps; each one is tested on Node and Cloudflare   |

Try a change in an example:

```bash
pnpm --dir examples/issue-triage dev
```

## Checks

Run these before you open a pull request. CI runs the same commands.

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

`pnpm test` builds the module and runs unit tests, `nuxi typecheck`, `node-server` and
`cloudflare-module` builds (in `wrangler dev`) and a `nuxt dev` session. The mock provider
keeps every test offline and free.

## Pull requests

- Keep changes focused, and add or update a test for every behavior change.
- Add a changeset for package changes: `pnpm changeset`.
- Use [Conventional Commits](https://www.conventionalcommits.org) for commit messages.
- Report security issues privately through GitHub security advisories, not public issues.
