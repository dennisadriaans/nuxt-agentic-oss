import type { RegistryContext } from '../context'
import { resolveWritableUserConfig } from '../config-file'
import { readOptional, writePrivateFile } from '../files'
import { proScope, registryKey, registryUrl, writeSettings } from '../npmrc'
import { describeEntitlement, fetchEntitlement } from '../registry'

/**
 * `agentic login`: check a license key against the registry, then route `@nuxtagentic-pro` to the
 * registry with that key in the user-level `.npmrc`. The project is never written to.
 */
export async function login(
  context: RegistryContext,
  {
    project,
    readKey,
  }: {
    project: string
    readKey: (question: string) => Promise<string>
  },
) {
  const { env, log } = context
  const key = (env.AGENTIC_LICENSE_KEY || (await readKey('License key: '))).trim()

  if (!key) {
    throw new Error('Enter the license key from your purchase email.')
  }

  const registry = registryUrl(context)
  const entitlement = await fetchEntitlement(context, {
    registry,
    token: key,
  })

  const path = await resolveWritableUserConfig(context, project)
  const npmrc = writeSettings((await readOptional(path)) ?? '', {
    [`${proScope}:registry`]: registry,
    [`${registryKey(registry)}:_authToken`]: key,
  })

  await writePrivateFile(path, npmrc)
  log(`Logged in as ${describeEntitlement(entitlement)}.`)
  log(`Saved the ${proScope} registry and your key to ${path}.`)
}
