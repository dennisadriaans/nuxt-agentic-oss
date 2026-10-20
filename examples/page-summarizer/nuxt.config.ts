export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxtagentic/nuxt'],
  css: ['~/assets/css/main.css'],
  compatibilityDate: '2026-10-16',
  devtools: { enabled: true },
  runtimeConfig: {
    public: {
      // The run endpoint is public, so `fetch_page` only reads these HTTPS hosts.
      allowedHosts: ['nuxt.com', 'vuejs.org', 'nitro.build', 'developer.mozilla.org'],
    },
  },
  nitro: {
    cloudflare: {
      deployConfig: true,
      wrangler: { name: 'nuxt-agentic-page-summarizer' },
    },
  },
})
