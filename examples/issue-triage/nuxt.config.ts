export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxtagentic/nuxt'],
  css: ['~/assets/css/main.css'],
  compatibilityDate: '2026-10-16',
  devtools: { enabled: true },
  nitro: {
    cloudflare: {
      deployConfig: true,
      wrangler: { name: 'nuxt-agentic-issue-triage' },
    },
  },
})
