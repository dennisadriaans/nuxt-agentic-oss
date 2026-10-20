import { z } from 'zod'
import type { RegistryContext } from './context'

const entitlementResponse = z.object({
  username: z.string(),
  tier: z.string(),
  updatesUntil: z.string().nullable(),
})

export type Entitlement = z.infer<typeof entitlementResponse>

const packumentResponse = z.looseObject({
  'dist-tags': z.record(z.string(), z.string()).default({}),
  versions: z.record(z.string(), z.unknown()).default({}),
})

async function readError(response: Response) {
  const body = await response.text()

  try {
    const { error } = z.object({ error: z.string() }).parse(JSON.parse(body))

    return error
  } catch {
    return `The registry answered ${response.status}.`
  }
}

async function request(
  { fetch }: Pick<RegistryContext, 'fetch'>,
  url: URL,
  token: string | undefined,
) {
  let response: Response

  try {
    response = await fetch(url, {
      headers: {
        accept: 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    })
  } catch (cause) {
    throw new Error(`Could not reach ${url.origin}.`, { cause })
  }

  if (response.status === 401) {
    throw new Error('The registry did not accept this license key.')
  }

  if (!response.ok) {
    throw new Error(await readError(response))
  }

  return response.json() as Promise<unknown>
}

/** Ask the registry who a license key belongs to and how long it receives updates. */
export async function fetchEntitlement(
  context: Pick<RegistryContext, 'fetch'>,
  {
    registry,
    token,
  }: {
    registry: string
    token: string
  },
) {
  return entitlementResponse.parse(await request(context, new URL('-/whoami', registry), token))
}

/** Read a package's versions and dist-tags visible to the license. */
export async function fetchPackument(
  context: Pick<RegistryContext, 'fetch'>,
  {
    registry,
    token,
    name,
  }: {
    registry: string
    token?: string
    name: string
  },
) {
  return packumentResponse.parse(await request(context, new URL(name, registry), token))
}

export function describeEntitlement({ username, tier, updatesUntil }: Entitlement) {
  const updates = updatesUntil ? `updates until ${updatesUntil.slice(0, 10)}` : 'all updates'

  return `${username} (${tier}, ${updates})`
}
