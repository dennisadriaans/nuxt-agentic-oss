import { join } from 'node:path'
import type { RegistryContext } from './context'
import { readOptional } from './files'

export const proScope = '@nuxtagentic-pro'
const defaultRegistry = 'https://registry.nuxtagentic.com/'

/** The registry URL with a trailing slash; `AGENTIC_REGISTRY_URL` overrides it for testing. */
export function registryUrl({ env }: Pick<RegistryContext, 'env'>) {
  const url = new URL(env.AGENTIC_REGISTRY_URL || defaultRegistry)
  const isLoopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)

  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) {
    throw new Error(`The registry must use https: ${url.href}`)
  }

  return url.href.endsWith('/') ? url.href : `${url.href}/`
}

/** The `//host/path/` prefix npm uses for per-registry settings such as `_authToken`. */
export function registryKey(registry: string) {
  return registry.replace(/^https?:/, '')
}

export function userConfigPath({ env, home }: Pick<RegistryContext, 'env' | 'home'>) {
  return env.NPM_CONFIG_USERCONFIG || env.npm_config_userconfig || join(home, '.npmrc')
}

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Read one `key=value` setting, expanding `${VARIABLE}` references the way npm does. */
export function readSetting(npmrc: string, key: string, env: NodeJS.ProcessEnv) {
  const match = new RegExp(`^\\s*${escapePattern(key)}\\s*=\\s*(.*?)\\s*$`, 'm').exec(npmrc)

  return match?.[1]?.replace(/\$\{([^}]+)\}/g, (_, name: string) => env[name] ?? '') || undefined
}

/** Replace the given settings in an `.npmrc`, keeping every other line. */
export function writeSettings(npmrc: string, settings: Record<string, string | undefined>) {
  const keys = Object.keys(settings)
  const kept = npmrc
    .split(/\r?\n/)
    .filter((line) => !keys.some((key) => new RegExp(`^\\s*${escapePattern(key)}\\s*=`).test(line)))

  while (kept.at(-1) === '') {
    kept.pop()
  }

  const updates = Object.entries(settings).flatMap(([key, value]) =>
    value === undefined ? [] : [`${key}=${value}`],
  )
  const lines = [...kept, ...updates]

  return `${lines.join('\n')}\n`
}

export interface RegistryAccess {
  registry: string
  token?: string
  tokenSource?: string
  scopeRegistry?: string
}

/**
 * Read the `@nuxtagentic-pro` route and the registry token the way the package manager does:
 * the project `.npmrc` wins over the user `.npmrc`.
 */
export async function readRegistryAccess(
  context: Pick<RegistryContext, 'env' | 'home'>,
  project?: string,
): Promise<RegistryAccess> {
  const { env } = context
  const registry = registryUrl(context)
  const access: RegistryAccess = { registry }

  for (const path of [...(project ? [join(project, '.npmrc')] : []), userConfigPath(context)]) {
    const npmrc = await readOptional(path)

    if (!npmrc) {
      continue
    }

    access.scopeRegistry ??= readSetting(npmrc, `${proScope}:registry`, env)
    const token = readSetting(npmrc, `${registryKey(registry)}:_authToken`, env)

    if (!access.token && token) {
      access.token = token
      access.tokenSource = path
    }
  }

  return access
}

/** Whether a configured scope registry is the Nuxt Agentic registry, ignoring a trailing slash. */
export function isSameRegistry(configured: string | undefined, registry: string) {
  return configured !== undefined && configured.replace(/\/?$/, '/') === registry
}
