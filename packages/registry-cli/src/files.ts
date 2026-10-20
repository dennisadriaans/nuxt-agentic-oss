import { chmod, readFile, writeFile } from 'node:fs/promises'

export function isMissingFile(cause: unknown) {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT'
}

export async function readOptional(path: string) {
  try {
    return await readFile(path, 'utf8')
  } catch (cause) {
    if (isMissingFile(cause)) {
      return undefined
    }

    throw cause
  }
}

/** Write a file only its owner can read, including when it already existed with wider access. */
export async function writePrivateFile(path: string, content: string) {
  await writeFile(path, content, { mode: 0o600 })
  await chmod(path, 0o600)
}
