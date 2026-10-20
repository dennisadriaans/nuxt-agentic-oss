const digestSchedule = '0 7 * * *'

export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxtagentic/nuxt'],
  css: ['~/assets/css/main.css'],
  compatibilityDate: '2026-10-16',
  devtools: { enabled: true },
  nitro: {
    experimental: { tasks: true },
    scheduledTasks: { [digestSchedule]: ['digest'] },
    cloudflare: {
      deployConfig: true,
      // Cloudflare calls the Worker on this schedule; Nitro then runs the matching tasks.
      wrangler: {
        name: 'nuxt-agentic-daily-digest',
        triggers: { crons: [digestSchedule] },
      },
    },
  },
})
