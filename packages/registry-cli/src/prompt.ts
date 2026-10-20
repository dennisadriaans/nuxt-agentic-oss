import { text } from 'node:stream/consumers'

/**
 * Read a secret without echoing it: masked on a terminal, otherwise the first line of stdin,
 * so `echo "$KEY" | agentic login` works in scripts.
 */
export async function readSecret(
  question: string,
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stderr,
) {
  if (!input.isTTY) {
    return (await text(input)).split(/\r?\n/)[0]?.trim() ?? ''
  }

  output.write(question)
  input.setRawMode(true)
  input.setEncoding('utf8')
  input.resume()

  return new Promise<string>((resolve, reject) => {
    let value = ''

    const finish = (error?: Error) => {
      input.off('data', onData)
      input.setRawMode(false)
      input.pause()
      output.write('\n')

      if (error) {
        reject(error)
      } else {
        resolve(value.trim())
      }
    }

    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === '\r' || character === '\n') {
          return finish()
        }

        if (character === '\u0003') {
          return finish(new Error('Cancelled.'))
        }

        if (character === '\u007f' || character === '\b') {
          if (value) {
            value = value.slice(0, -1)
            output.write('\b \b')
          }

          continue
        }

        if (character >= ' ') {
          value += character
          output.write('*')
        }
      }
    }

    input.on('data', onData)
  })
}
