import { homedir } from 'node:os'

export interface RegistryContext {
  env: NodeJS.ProcessEnv
  home: string
  fetch: typeof fetch
  log: (line: string) => void
}

export function createRegistryContext(): RegistryContext {
  return {
    env: process.env,
    home: homedir(),
    fetch: globalThis.fetch,
    log: (line) => console.log(line),
  }
}
