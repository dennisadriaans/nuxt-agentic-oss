const MAX_TEXT_LENGTH = 12_000
const MAX_REDIRECTS = 3

const entities: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  nbsp: ' ',
}

function decodeEntities(text: string) {
  return text.replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/g, (_, name: string) => entities[name]!)
}

/** The page title and its readable text: the main content without scripts, styles or navigation. */
export function extractPageText(html: string) {
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim()
  const content =
    html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html.match(/<body[\s\S]*<\/body>/i)?.[0] ?? html
  const text = decodeEntities(
    content
      .replace(/<(script|style|noscript|svg|nav|header|footer)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()

  return {
    title,
    text: text.slice(0, MAX_TEXT_LENGTH),
    truncated: text.length > MAX_TEXT_LENGTH,
  }
}

function assertAllowed(url: URL, allowedHosts: readonly string[]) {
  if (url.protocol !== 'https:' || !allowedHosts.includes(url.hostname)) {
    throw new Error(
      `Only HTTPS pages on these hosts can be read: ${allowedHosts.join(', ')}. Got ${url.href}.`,
    )
  }
}

/** Download an HTML page from an allowed host, checking every redirect against the same list. */
export async function fetchPageText(
  address: string,
  allowedHosts: readonly string[],
  signal?: AbortSignal,
) {
  let url = new URL(address)

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    assertAllowed(url, allowedHosts)
    const response = await fetch(url, {
      redirect: 'manual',
      signal,
      headers: { Accept: 'text/html' },
    })
    const location = response.headers.get('location')

    if (response.status >= 300 && response.status < 400 && location) {
      url = new URL(location, url)
      continue
    }

    if (!response.ok) {
      throw new Error(`${url.href} answered with status ${response.status}.`)
    }

    return {
      url: url.href,
      ...extractPageText(await response.text()),
    }
  }

  throw new Error(`${address} redirected more than ${MAX_REDIRECTS} times.`)
}
