import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const cli = resolve(import.meta.dirname, '../dist/cli.mjs')

function runCli(options: {
  args: string[]
  project: string
  env: NodeJS.ProcessEnv
  input?: string
}) {
  const { args, project, env, input = '' } = options

  return new Promise<{ code: number | null; output: string }>((resolveResult, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: project,
      env: {
        ...process.env,
        ...env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let output = ''

    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    child.on('error', reject)
    child.on('close', (code) =>
      resolveResult({
        code,
        output,
      }),
    )
    child.stdin.end(input)
  })
}

test('the built public binary logs in, checks access and logs out from an empty directory', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'agentic-bootstrap-'))

  t.after(() =>
    rm(directory, {
      recursive: true,
      force: true,
    }),
  )
  const project = join(directory, 'project')

  await mkdir(project)
  const npmrc = join(directory, '.npmrc')
  const key = 'BOOTSTRAP-FIXTURE-LICENSE'
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json')

    if (request.url !== '/-/whoami' || request.headers.authorization !== `Bearer ${key}`) {
      response.writeHead(401).end(JSON.stringify({ error: 'Invalid license key.' }))

      return
    }

    response.end(
      JSON.stringify({
        username: 'license …TEST',
        tier: 'team',
        updatesUntil: null,
      }),
    )
  })

  await new Promise<void>((resolveListening) => server.listen(0, '127.0.0.1', resolveListening))
  t.after(() => new Promise<void>((resolveClosed) => server.close(() => resolveClosed())))
  const address = server.address()

  assert.ok(address && typeof address !== 'string')
  const env = {
    NPM_CONFIG_USERCONFIG: npmrc,
    AGENTIC_LICENSE_KEY: '',
    AGENTIC_REGISTRY_URL: `http://127.0.0.1:${address.port}/`,
  }
  const login = await runCli({
    args: ['login'],
    project,
    env,
    input: `${key}\n`,
  })

  assert.equal(login.code, 0, login.output)
  assert.match(login.output, /team, all updates/)
  assert.ok(!login.output.includes(key))
  assert.match(await readFile(npmrc, 'utf8'), /@nuxtagentic-pro:registry=/)

  const status = await runCli({
    args: ['whoami'],
    project,
    env,
  })

  assert.equal(status.code, 0, status.output)
  assert.match(status.output, /team, all updates/)
  assert.ok(!status.output.includes(key))

  const logout = await runCli({
    args: ['logout'],
    project,
    env,
  })

  assert.equal(logout.code, 0, logout.output)
  assert.ok(!(await readFile(npmrc, 'utf8')).includes('_authToken'))
  const loggedOut = await runCli({
    args: ['status'],
    project,
    env,
  })

  assert.equal(loggedOut.code, 1)
  assert.match(loggedOut.output, /No license key/)

  const positionalKey = await runCli({
    args: ['login', key],
    project,
    env,
  })

  assert.equal(positionalKey.code, 1)
  assert.ok(!positionalKey.output.includes(key))
})
