import type { AgentRunEvent } from '@nuxtagentic/nuxt'

export interface Digest {
  text: string
  createdAt: string
}

const storageKey = 'latest'

/** The latest scheduled digest. Mount a persistent driver on `digests` to keep it across restarts. */
export function readLatestDigest() {
  return useStorage('digests').getItem<Digest>(storageKey)
}

function parseRunEvents(stream: string) {
  return stream
    .split('\n\n')
    .filter(Boolean)
    .map((block) => JSON.parse(block.slice(block.indexOf('data:') + 5)) as AgentRunEvent)
}

/** Run the digest agent through its endpoint, like the page does, and store the answer. */
export async function writeDigest(): Promise<Digest> {
  const { runPath } = useRuntimeConfig().public.agentic
  const stream = await $fetch<string>(`${runPath}/digest`, {
    method: 'POST',
    body: { input: digestInput() },
    responseType: 'text',
  })
  let answer: string | undefined

  for (const event of parseRunEvents(stream)) {
    if (event.type === 'error') {
      throw new Error(event.message)
    }

    if (event.type === 'message') {
      answer = event.text
    }
  }

  if (!answer) {
    throw new Error('The digest run ended without an answer.')
  }

  const digest = {
    text: answer,
    createdAt: new Date().toISOString(),
  }

  await useStorage('digests').setItem(storageKey, digest)

  return digest
}
