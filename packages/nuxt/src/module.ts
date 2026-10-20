import { resolve } from 'node:path'
import {
  addImports,
  addServerHandler,
  addTemplate,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  updateTemplates,
  useLogger,
} from '@nuxt/kit'
import type { Nuxt, NuxtModule } from '@nuxt/schema'
import type { NitroConfig } from 'nitropack'
import { addCustomTab } from '@nuxt/devtools-kit'
import { renderRegistry, renderTypes, scanRegistry } from './registry'

export type { AgentToolContext, AgentToolDefinition, AgentTool } from './tool'
export type {
  AgentMessage,
  AgentName,
  AgentRegistry,
  AgentRunEvent,
  AgentRunStatus,
  UseAgentReturn,
} from './types'

export interface ModuleOptions {
  /**
   * Markdown agents, scanned in the app and every layer.
   *
   * @default 'server/agents'
   */
  agentsDir: string
  /**
   * Tool files with a `defineAgentTool` default export.
   *
   * @default 'server/tools'
   */
  toolsDir: string
  /**
   * Prefix of the run endpoint: `POST <route>/run/:agent`.
   *
   * @default '/api/_agentic'
   */
  route: string
}

/** How a module that builds on these runs (such as Nuxt Agentic Pro) replaces parts of them. */
export interface AgentRunsExtension {
  /** Module path whose default export is an `AgentRunHost`. */
  host?: string
  /**
   * Auto-import `defineAgentTool` on the server. Set `false` when the extension provides its own.
   *
   * @default true
   */
  autoImportTool?: boolean
  /**
   * The host lists every tool through `AgentRunHost.tools()`, so `toolsDir` is not imported.
   *
   * @default false
   */
  hostTools?: boolean
}

interface AgentRunsState {
  host: string
  autoImportTool: boolean
  hostTools: boolean
}

const installed = new WeakMap<Nuxt, AgentRunsState>()

const registryTemplate = 'agentic-runs/registry.mjs'
const typesTemplate = 'types/agentic-runs.d.ts'
const devtoolsRoute = '/__agentic-runs/devtools'

function configRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? { ...value } : {}
}

/**
 * Install the run endpoint, registry and `useAgent()` once per Nuxt instance.
 *
 * Later calls only apply their extension, so the module and an extending module can both call
 * it in any order.
 */
export async function installAgentRuns(
  options: ModuleOptions,
  nuxt: Nuxt,
  extension: AgentRunsExtension = {},
) {
  const resolver = createResolver(import.meta.url)
  const existing = installed.get(nuxt)

  if (existing) {
    existing.host = extension.host ?? existing.host
    existing.autoImportTool &&= extension.autoImportTool ?? true
    existing.hostTools ||= extension.hostTools ?? false

    return
  }

  const state: AgentRunsState = {
    host: extension.host ?? resolver.resolve('./runtime/server/default-host'),
    autoImportTool: extension.autoImportTool ?? true,
    hostTools: extension.hostTools ?? false,
  }

  installed.set(nuxt, state)

  const logger = useLogger('agentic')
  const route = `/${options.route.replace(/^\/+|\/+$/g, '')}`
  const runPath = `${route}/run`
  const roots = nuxt.options._layers.map(({ config }) => config.rootDir)
  const scan = () => scanRegistry(roots, options)
  const registry = await scan()

  logger.info(
    `Nuxt Agentic: ${registry.agents.length} agent(s), ${registry.tools.length} tool(s) at ${runPath}`,
  )

  const registryPath = addTemplate({
    filename: registryTemplate,
    write: true,
    getContents: async () => {
      const scanned = await scan()

      return renderRegistry(
        state.hostTools
          ? {
              ...scanned,
              tools: [],
            }
          : scanned,
      )
    },
  }).dst

  addTypeTemplate(
    {
      filename: typesTemplate,
      getContents: async () => renderTypes(await scan()),
    },
    {
      nitro: true,
      nuxt: true,
    },
  )

  const { runtimeConfig } = nuxt.options

  runtimeConfig.agentic = {
    openaiApiKey: '',
    anthropicApiKey: '',
    googleApiKey: '',
    ...configRecord(runtimeConfig.agentic),
  }
  runtimeConfig.public.agentic = {
    ...configRecord(runtimeConfig.public.agentic),
    runPath,
  }

  addServerHandler({
    route: `${runPath}/:agent`,
    method: 'post',
    handler: resolver.resolve('./runtime/server/run-handler'),
  })
  addImports({
    name: 'useAgent',
    from: resolver.resolve('./runtime/app/use-agent'),
  })

  nuxt.hook('nitro:config', (nitroConfig) => {
    // @nuxt/schema types Nitro loosely unless nitropack resolves from its own location.
    const config = nitroConfig as NitroConfig

    config.alias = {
      ...config.alias,
      '#agentic-runs/registry': registryPath,
      '#agentic-runs/host': state.host,
    }
    // The build directory may sit in node_modules; inline it so tool files get auto-imports.
    config.externals = {
      ...config.externals,
      inline: [...(config.externals?.inline ?? []), registryPath],
    }

    if (state.autoImportTool && config.imports !== false) {
      config.imports = {
        ...config.imports,
        imports: [
          ...(config.imports?.imports ?? []),
          {
            name: 'defineAgentTool',
            from: resolver.resolve('./tool'),
          },
        ],
      }
    }
  })

  if (!nuxt.options.dev) {
    return
  }

  addServerHandler({
    route: `${devtoolsRoute}.json`,
    method: 'get',
    handler: resolver.resolve('./runtime/server/devtools-handler'),
  })
  addServerHandler({
    route: devtoolsRoute,
    method: 'get',
    handler: resolver.resolve('./runtime/server/devtools-page'),
  })
  addCustomTab({
    name: 'agentic-runs',
    title: 'Agent runs',
    icon: 'i-lucide-bot',
    view: {
      type: 'iframe',
      src: devtoolsRoute,
    },
  })
  nuxt.hook('builder:watch', async (event, path) => {
    const absolute = resolve(nuxt.options.srcDir, path)
    const isIn = (directory: string) =>
      roots.some((root) => absolute.startsWith(resolve(root, directory)))
    // Agent edits change sources and names; tool edits only matter when a file appears or goes.
    const isToolFileChange = (event === 'add' || event === 'unlink') && isIn(options.toolsDir)

    if (isIn(options.agentsDir) || isToolFileChange) {
      await updateTemplates({
        filter: ({ filename }) => filename === registryTemplate || filename === typesTemplate,
      })
    }
  })
}

const agenticRunsModule: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@nuxtagentic/nuxt',
    configKey: 'agentic',
    compatibility: { nuxt: '>=4.6.0' },
  },
  defaults: {
    agentsDir: 'server/agents',
    toolsDir: 'server/tools',
    route: '/api/_agentic',
  },
  setup: (options, nuxt) => installAgentRuns(options, nuxt),
})

export default agenticRunsModule
