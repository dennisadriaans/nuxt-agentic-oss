# Upgrade to Pro

Nuxt Agentic runs an agent inside one request and forgets it. Nuxt Agentic Pro keeps your
agents and tools and adds everything a product needs around them.

| You need                                   | Nuxt Agentic | Nuxt Agentic Pro                                |
| ------------------------------------------ | ------------ | ----------------------------------------------- |
| Markdown agents and `defineAgentTool`      | Yes          | Yes, unchanged                                  |
| Streaming runs and `useAgent()`            | Yes          | Yes, for signed-in users                        |
| Runs that survive a closed tab or a deploy | No           | Durable runs on Cloudflare Durable Objects      |
| A person approves risky tool calls         | No           | Approval inbox with exact arguments and replay  |
| Agents edited by your users                | No           | Dashboard agent editor with autosave            |
| Scheduled and event-driven work            | No           | Automations: cron, webhooks, integration events |
| Gmail, Slack, GitHub, Linear and more      | No           | Integrations with OAuth and encrypted tokens    |
| Sign-in, organizations and workspaces      | No           | Better Auth, passkeys, 2FA, workspace isolation |
| Your database tables as agent tools        | No           | Agentic Models with access rules and approvals  |
| Coding agents and MCP clients use your app | No           | Hosted MCP endpoint                             |

## Move an app to Pro

1. Buy a license and add the private registry with your license key, as the Pro installation
   guide describes.
2. Install the layer: `pnpm add @nuxtagentic-pro/nuxt`.
3. Extend it and keep the free module:

   ```ts [nuxt.config.ts]
   export default defineNuxtConfig({
     extends: ['@nuxtagentic-pro/nuxt'],
     modules: ['@nuxtagentic/nuxt'],
   })
   ```

4. Follow the Pro setup guide for the database, auth secret and Cloudflare bindings.

Your `server/agents` and `server/tools` stay where they are. They also appear in the dashboard,
and `useAgent()` keeps calling the same endpoint. Under Pro the endpoint requires a signed-in
user, and tool handlers also receive `actor`, `database` and `env` next to `signal`. Agents may
then enable the same tools as dashboard agents, such as model tools (`customer_list`) and
`web_fetch`. Provider keys come from the Worker environment (`OPENAI_API_KEY`,
`ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`). For runs that survive reloads and pause for approval,
use Pro's `useDurableAgent()`.

See [nuxtagentic.com](https://nuxtagentic.com) for plans and the full documentation.
