# @nuxtagentic/cli

Connect a machine to the Nuxt Agentic Pro registry before installing a starter. This public,
MIT-licensed CLI installs from npm and has no Pro package dependencies.

## First-time setup

Run either command, then paste the license key from your purchase email at the masked prompt:

```sh
npx @nuxtagentic/cli@latest login
```

```sh
pnpm dlx @nuxtagentic/cli@latest login
```

Prerelease users use `@next` instead of `@latest`.

Login validates the key and saves the `@nuxtagentic-pro` registry route and token in your user
`~/.npmrc`, with owner-only file permissions. It preserves your other npm settings and refuses
to put the key in a project config. You can also pipe the key on stdin or set
`AGENTIC_LICENSE_KEY`; avoid passing it as a command-line argument.

After login, clone your purchased starter repository and run `pnpm install`. The starter's
`pnpm exec agentic` command provides project diagnostics, upgrades, secret generation and coding
agent plugins.

## Registry commands

```sh
pnpm dlx @nuxtagentic/cli@latest status
pnpm dlx @nuxtagentic/cli@latest logout
```

`status` (also `whoami`) checks the effective project and user configuration, validates the key,
and prints your tier and update window without exposing the key. It exits unsuccessfully when
access is missing or refused. Pass `--project <dir>` to check a particular project.

`logout` removes the saved user token. It keeps the registry route and other npm settings.
Project credentials and CI environment variables remain under their own configuration.

`NPM_CONFIG_USERCONFIG` selects an alternative user config file. `AGENTIC_REGISTRY_URL` selects
another HTTPS registry; HTTP is accepted only for local loopback testing.

## Shared API

The Pro project CLI imports the registry commands and configuration helpers from this package.
The `./files` entry provides its shared private-file helpers. Both CLIs use one implementation
for license validation and registry credentials.

## License

[MIT](./LICENSE)
