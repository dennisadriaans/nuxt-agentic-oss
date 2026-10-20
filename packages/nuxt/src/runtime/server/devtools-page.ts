import { defineEventHandler, getRequestHost, setResponseHeader } from 'h3'
import { assertLoopback } from './loopback'

const page = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent runs</title>
<style>
  :root { color-scheme: light dark; --muted: #6b7280; --line: #e5e7eb; --ok: #059669; --bad: #dc2626; --warn: #d97706; }
  @media (prefers-color-scheme: dark) { :root { --line: #27272a; } }
  body { margin: 0; font: 13px/1.5 ui-sans-serif, system-ui, sans-serif; }
  main { display: grid; gap: 24px; padding: 16px; }
  h2 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-weight: 500; color: var(--muted); }
  code, pre { font: 12px/1.5 ui-monospace, monospace; }
  pre { margin: 4px 0 0; white-space: pre-wrap; word-break: break-word; }
  details summary { cursor: pointer; }
  details summary:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
  .success { color: var(--ok); } .error { color: var(--bad); } .running, .approval { color: var(--warn); } .stopped { color: var(--muted); }
  .alert { padding: 8px 12px; border: 1px solid var(--bad); color: var(--bad); border-radius: 6px; }
  .empty { color: var(--muted); }
</style>
</head>
<body>
<main>
  <p class="alert" id="error" hidden></p>
  <section><h2>Agents</h2><table><thead><tr><th>Name</th><th>Title</th><th>Model</th><th>Tools</th></tr></thead><tbody id="agents"></tbody></table></section>
  <section><h2>Tools</h2><table><thead><tr><th>Name</th><th>Description</th><th>Approval</th></tr></thead><tbody id="tools"></tbody></table></section>
  <section><h2>Last 50 runs</h2><div id="runs"></div></section>
</main>
<script type="module">
  const element = (tag, text, className) => {
    const node = document.createElement(tag)
    if (text !== undefined) node.textContent = text
    if (className) node.className = className
    return node
  }
  const row = (cells) => {
    const tr = element('tr')
    for (const cell of cells) tr.append(cell instanceof Node ? cell : element('td', cell))
    return tr
  }
  const fill = (id, rows, empty, columns) => {
    const body = document.getElementById(id)
    body.replaceChildren(...(rows.length ? rows : [row([Object.assign(element('td', empty, 'empty'), { colSpan: columns })])]))
  }
  const describe = (event) => {
    switch (event.type) {
      case 'start': return 'started ' + event.runId
      case 'tool': return 'tool ' + event.name + ' ' + JSON.stringify(event.input)
      case 'tool-result': return 'tool ' + event.name + ' returned ' + JSON.stringify(event.output)
      case 'tool-error': return 'tool ' + event.name + ' failed: ' + event.message
      case 'approval': return 'tool ' + event.name + ' needs approval ' + JSON.stringify(event.input)
      case 'message': return event.text
      case 'error': return 'error: ' + event.message
    }
  }
  const open = new Set()
  async function refresh() {
    const response = await fetch('./devtools.json')
    const data = await response.json()
    const error = document.getElementById('error')
    error.hidden = !data.error && response.ok
    error.textContent = data.error ?? data.statusMessage ?? ''
    if (!response.ok) return
    fill('agents', data.agents.map((agent) => row([element('td', agent.name), agent.title, agent.provider + ' / ' + agent.model, agent.tools.join(', ') || '—'])), 'No agents in server/agents.', 4)
    fill('tools', data.tools.map((tool) => row([element('td', tool.name), tool.description, tool.approval ? 'Required' : '—'])), 'No tools in server/tools.', 3)
    const runs = document.getElementById('runs')
    runs.replaceChildren(...(data.runs.length ? data.runs.map((run) => {
      const details = element('details')
      details.open = open.has(run.runId)
      details.addEventListener('toggle', () => details.open ? open.add(run.runId) : open.delete(run.runId))
      const summary = element('summary')
      summary.append(element('span', run.status, run.status), ' ', element('code', run.agent), ' ', new Date(run.startedAt).toLocaleTimeString())
      details.append(summary, element('pre', 'input: ' + JSON.stringify(run.input)))
      for (const event of run.events) details.append(element('pre', describe(event), event.type === 'error' || event.type === 'tool-error' ? 'error' : undefined))
      return details
    }) : [element('p', 'Run an agent with useAgent() to see it here.', 'empty')]))
  }
  refresh()
  setInterval(refresh, 2000)
</script>
</body>
</html>`

/**
 * Serve the DevTools iframe page.
 *
 * The page has no dependencies, so it also works in apps without pages or Nuxt UI.
 */
export default defineEventHandler((event) => {
  assertLoopback(getRequestHost(event))
  setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8')

  return page
})
