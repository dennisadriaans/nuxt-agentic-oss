import type { RegistryContext } from '../context'
import { resolveWritableUserConfig } from '../config-file'
import { readOptional, writePrivateFile } from '../files'
import { registryKey, registryUrl, writeSettings } from '../npmrc'

/** Remove this registry's saved user token while preserving registry routes and other settings. */
export async function logout(context: RegistryContext, { project }: { project: string }) {
  const path = await resolveWritableUserConfig(context, project)
  const npmrc = await readOptional(path)

  if (npmrc === undefined) {
    context.log('No registry credentials are saved in your user npm config.')

    return
  }

  const tokenKey = `${registryKey(registryUrl(context))}:_authToken`

  await writePrivateFile(path, writeSettings(npmrc, { [tokenKey]: undefined }))
  context.log(`Removed saved registry credentials from ${path}.`)
}
