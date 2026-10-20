import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { login, logout, registryUrl, status, type RegistryContext } from '../src/index'

const licenseKey = 'TEST-LICENSE-1234'
const registry = 'https://registry.example.test/'
const route = `@nuxtagentic-pro:registry=${registry}\n`
const tokenSetting = `//registry.example.test/:_authToken=${licenseKey}\n`
const entitlement = {
  username: 'license …1234',
  tier: 'solo',
  updatesUntil: '2027-10-18T00:00:00Z',
}

async function createFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'agentic-registry-cli-'))
  const project = join(directory, 'project')
  const home = join(directory, 'home')

  await Promise.all([mkdir(project), mkdir(home)])
  const npmrc = join(home, '.npmrc')
  const lines: string[] = []
  const requests: Request[] = []
  const context: RegistryContext = {
    home,
    env: {
      NPM_CONFIG_USERCONFIG: npmrc,
      AGENTIC_REGISTRY_URL: registry,
    },
    log: (line) => lines.push(line),
    fetch: async (input, init) => {
      const request = new Request(input, init)

      requests.push(request)

      return request.headers.get('authorization') === `Bearer ${licenseKey}`
        ? Response.json(entitlement)
        : Response.json({ error: 'Invalid license key.' }, { status: 401 })
    },
  }

  return {
    directory,
    project,
    home,
    npmrc,
    context,
    lines,
    requests,
    close: () =>
      rm(directory, {
        recursive: true,
        force: true,
      }),
  }
}

test('a fresh machine can log in before installing a project, preserving unrelated settings', async (t) => {
  const fixture = await createFixture()

  t.after(fixture.close)
  const { project, npmrc, context, lines, requests } = fixture

  await writeFile(npmrc, 'save-exact=true\n//other.test/:_authToken=keep\n', { mode: 0o644 })

  await login(context, {
    project,
    readKey: async () => licenseKey,
  })

  assert.equal(
    await readFile(npmrc, 'utf8'),
    `save-exact=true\n//other.test/:_authToken=keep\n${route}${tokenSetting}`,
  )
  assert.equal((await stat(npmrc)).mode & 0o777, 0o600)
  await assert.rejects(stat(join(project, '.npmrc')), { code: 'ENOENT' })
  assert.equal(requests[0]?.url, `${registry}-/whoami`)
  assert.deepEqual(await status(context, { project }), entitlement)
  assert.match(lines.join('\n'), /solo, updates until 2027-10-18/)
  assert.ok(!lines.join('\n').includes(licenseKey))
})

test('refused keys and registry outages leave previously saved credentials unchanged', async (t) => {
  const fixture = await createFixture()

  t.after(fixture.close)
  const { project, npmrc, context } = fixture
  const original = `${route}//registry.example.test/:_authToken=previous-key\n`

  await writeFile(npmrc, original)

  await assert.rejects(
    login(context, {
      project,
      readKey: async () => 'wrong-key',
    }),
    /did not accept/,
  )
  assert.equal(await readFile(npmrc, 'utf8'), original)

  context.fetch = async () => Response.json({ error: 'Try again soon.' }, { status: 503 })
  await assert.rejects(
    login(context, {
      project,
      readKey: async () => licenseKey,
    }),
    /Try again soon/,
  )
  assert.equal(await readFile(npmrc, 'utf8'), original)

  context.fetch = async () => {
    throw new Error('Offline')
  }

  await assert.rejects(
    login(context, {
      project,
      readKey: async () => licenseKey,
    }),
    /Could not reach/,
  )
  assert.equal(await readFile(npmrc, 'utf8'), original)
})

test('status reports the effective project token, including environment expansion', async (t) => {
  const fixture = await createFixture()

  t.after(fixture.close)
  const { project, npmrc, context, lines, requests } = fixture

  await writeFile(npmrc, `${route}//registry.example.test/:_authToken=stale-user-key\n`)
  await writeFile(join(project, '.npmrc'), '//registry.example.test/:_authToken=${PROJECT_KEY}\n')
  context.env.PROJECT_KEY = licenseKey

  assert.deepEqual(await status(context, { project }), entitlement)
  assert.equal(requests.at(-1)?.headers.get('authorization'), `Bearer ${licenseKey}`)
  assert.match(lines.at(-1) ?? '', new RegExp(project.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.ok(!lines.join('\n').includes(licenseKey))
})

test('status fails before transport for missing access or an overriding project registry', async (t) => {
  const fixture = await createFixture()

  t.after(fixture.close)
  const { project, npmrc, context, requests } = fixture

  await assert.rejects(status(context, { project }), /not routed/)
  await writeFile(npmrc, route)
  await assert.rejects(status(context, { project }), /No license key/)
  await writeFile(npmrc, `${route}${tokenSetting}`)
  await writeFile(join(project, '.npmrc'), '@nuxtagentic-pro:registry=https://other.test/\n')
  await assert.rejects(status(context, { project }), /not routed/)
  assert.equal(requests.length, 0)
})

test('logout removes only this registry token and preserves other registries and routing', async (t) => {
  const fixture = await createFixture()

  t.after(fixture.close)
  const { project, npmrc, context, requests } = fixture
  const remaining = `save-exact=true\n${route}//other.test/:_authToken=keep\n`

  await writeFile(npmrc, `${remaining}${tokenSetting}`, { mode: 0o644 })

  await logout(context, { project })
  assert.equal(await readFile(npmrc, 'utf8'), remaining)
  assert.equal((await stat(npmrc)).mode & 0o777, 0o600)
  await logout(context, { project })
  assert.equal(await readFile(npmrc, 'utf8'), remaining)
  assert.equal(requests.length, 0)
})

test('logout on a new machine does not create a config or contact the registry', async (t) => {
  const fixture = await createFixture()

  t.after(fixture.close)
  const { project, npmrc, context, requests } = fixture

  await logout(context, { project })
  await assert.rejects(stat(npmrc), { code: 'ENOENT' })
  assert.equal(requests.length, 0)
})

test('login and logout refuse a project config or a symlink to it', async (t) => {
  const fixture = await createFixture()

  t.after(fixture.close)
  const { project, npmrc, context } = fixture
  const projectConfig = join(project, '.npmrc')

  await writeFile(projectConfig, 'save-exact=true\n')
  await symlink(projectConfig, npmrc)

  await assert.rejects(
    login(context, {
      project,
      readKey: async () => licenseKey,
    }),
    /regular file/,
  )
  await assert.rejects(logout(context, { project }), /regular file/)
  assert.equal(await readFile(projectConfig, 'utf8'), 'save-exact=true\n')

  context.env.NPM_CONFIG_USERCONFIG = projectConfig
  await assert.rejects(
    login(context, {
      project,
      readKey: async () => licenseKey,
    }),
    /repository/,
  )
  await assert.rejects(logout(context, { project }), /repository/)
  assert.equal(await readFile(projectConfig, 'utf8'), 'save-exact=true\n')
})

test('registry credentials use HTTPS except for explicit local loopback testing', () => {
  assert.throws(
    () => registryUrl({ env: { AGENTIC_REGISTRY_URL: 'http://registry.test' } }),
    /https/,
  )
  assert.equal(
    registryUrl({ env: { AGENTIC_REGISTRY_URL: 'http://127.0.0.1:1234' } }),
    'http://127.0.0.1:1234/',
  )
})
