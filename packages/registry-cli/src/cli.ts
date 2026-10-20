#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { login } from './commands/login'
import { logout } from './commands/logout'
import { status } from './commands/status'
import { createRegistryContext } from './context'
import { readSecret } from './prompt'

const usage = `Usage: agentic <command> [options]

Public registry setup for Nuxt Agentic Pro:
  npx @nuxtagentic/cli@latest login
  pnpm dlx @nuxtagentic/cli@latest login

Commands:
  login                 Validate a license key and configure your user .npmrc
  status, whoami        Check registry access, license tier and update window
  logout                Remove the registry token from your user .npmrc

Options:
  --project <dir>       Project directory for configuration checks (default: current directory)
  -h, --help            Show this help

Environment:
  AGENTIC_LICENSE_KEY   login: use this key instead of prompting
  AGENTIC_REGISTRY_URL  Registry URL (default: https://registry.nuxtagentic.com/)

After cloning and installing a starter, run pnpm exec agentic --help for project commands.`

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      project: {
        type: 'string',
        default: process.cwd(),
      },
      help: {
        type: 'boolean',
        short: 'h',
      },
    },
  })
  const [command] = positionals

  if (values.help || !command) {
    console.log(usage)

    return
  }

  if (positionals.length > 1) {
    throw new Error('Pass the license key at the prompt or through AGENTIC_LICENSE_KEY.')
  }

  const context = createRegistryContext()
  const { project } = values

  switch (command) {
    case 'login':
      await login(context, {
        project,
        readKey: readSecret,
      })
      context.log('Next: clone your starter repository, then run pnpm install.')

      return
    case 'status':
    case 'whoami':
      await status(context, { project })

      return
    case 'logout':
      await logout(context, { project })

      return
    default:
      throw new Error(`Unknown command "${command}". Run agentic --help.`)
  }
}

main().catch((cause: unknown) => {
  console.error(`[agentic] ${cause instanceof Error ? cause.message : 'The command failed.'}`)
  process.exitCode = 1
})
