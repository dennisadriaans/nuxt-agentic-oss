import type { RegistryContext } from '../context'
import { isSameRegistry, proScope, readRegistryAccess } from '../npmrc'
import { describeEntitlement, fetchEntitlement } from '../registry'

/** Check the effective project and user configuration without printing the license key. */
export async function status(context: RegistryContext, { project }: { project: string }) {
  const { registry, scopeRegistry, token, tokenSource } = await readRegistryAccess(context, project)

  if (!isSameRegistry(scopeRegistry, registry)) {
    throw new Error(
      `${proScope} is not routed to ${registry}. Run agentic login and check the project's .npmrc.`,
    )
  }

  if (!token) {
    throw new Error('No license key found for the registry. Run agentic login first.')
  }

  const entitlement = await fetchEntitlement(context, {
    registry,
    token,
  })

  context.log(`Logged in as ${describeEntitlement(entitlement)}.`)
  context.log(`Registry: ${registry}`)
  context.log(`Credentials: ${tokenSource}`)

  return entitlement
}
