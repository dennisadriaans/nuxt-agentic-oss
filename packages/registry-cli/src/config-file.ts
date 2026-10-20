import { lstat } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { RegistryContext } from './context'
import { isMissingFile } from './files'
import { userConfigPath } from './npmrc'

export async function resolveWritableUserConfig(context: RegistryContext, project: string) {
  const path = resolve(userConfigPath(context))

  if (path === resolve(project, '.npmrc')) {
    throw new Error(`${path} is this project's .npmrc. Keep license keys out of the repository.`)
  }

  try {
    const file = await lstat(path)

    if (!file.isFile()) {
      throw new Error(`The user npm config must be a regular file: ${path}`)
    }
  } catch (cause) {
    if (!isMissingFile(cause)) {
      throw cause
    }
  }

  return path
}
