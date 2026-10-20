export default defineNuxtConfig({
  modules: ['@nuxtagentic/nuxt'],
  compatibilityDate: '2026-10-16',
  devtools: { enabled: false },
  nitro: {
    cloudflare: {
      deployConfig: true,
      wrangler: { name: 'nuxt-agentic-fixture' },
    },
  },
})
