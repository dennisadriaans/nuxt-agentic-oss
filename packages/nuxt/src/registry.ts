import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

const sourceExtensions = /\.(?:[cm]?[jt]s)$/
const agentName = /^[a-z0-9][a-z0-9-]{0,79}$/

export interface ScannedRegistry {
  agents: { name: string; source: string }[]
  tools: string[]
}

async function listFiles(directory: string, include: (name: string) => boolean) {
  if (!existsSync(directory)) {
    return []
  }

  const entries = await readdir(directory, { withFileTypes: true })

  return entries
    .filter((entry) => entry.isFile() && include(entry.name))
    .map((entry) => join(directory, entry.name))
    .sort()
}

/**
 * Discover agents and tools in the app and every layer. Roots are ordered app first, so an app
 * agent replaces a layer agent with the same name.
 */
export async function scanRegistry(
  roots: readonly string[],
  directories: {
    agentsDir: string
    toolsDir: string
  },
): Promise<ScannedRegistry> {
  const scan = (directory: string, include: (name: string) => boolean) =>
    Promise.all(roots.map((root) => listFiles(resolve(root, directory), include)))
  const [agentFiles, tools] = await Promise.all([
    scan(directories.agentsDir, (name) => name.endsWith('.md')),
    scan(directories.toolsDir, (name) => sourceExtensions.test(name) && !name.endsWith('.d.ts')),
  ])
  const agents = new Map<string, { name: string; source: string }>()

  for (const path of agentFiles.flat()) {
    const name = basename(path, '.md')

    if (!agentName.test(name)) {
      throw new Error(`${path}: name agent files with lowercase letters, digits and hyphens.`)
    }

    if (!agents.has(name)) {
      agents.set(name, {
        name,
        source: await readFile(path, 'utf8'),
      })
    }
  }

  return {
    agents: [...agents.values()],
    tools: tools.flat(),
  }
}

/** The `#agentic-runs/registry` module: agent sources and every tool file's default export. */
export function renderRegistry({ agents, tools }: ScannedRegistry) {
  return [
    ...tools.map((path, index) => `import tool${index} from ${JSON.stringify(path)}`),
    '',
    `export const agents = ${JSON.stringify(agents)}`,
    `export const tools = [${tools.map((_, index) => `tool${index}`).join(', ')}]`,
    '',
  ].join('\n')
}

/** Generated types: `useAgent()` accepts the names in `server/agents`. */
export function renderTypes({ agents }: ScannedRegistry) {
  const names = agents.map(({ name }) => JSON.stringify(name)).join(' | ') || 'never'

  return [
    "declare module '@nuxtagentic/nuxt/types' {",
    '  interface AgentRegistry {',
    `    agents: ${names}`,
    '  }',
    '}',
    '',
    'export {}',
    '',
  ].join('\n')
}
