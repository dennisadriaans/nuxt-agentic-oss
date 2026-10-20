<script setup lang="ts">
useHead({
  title: 'Page summarizer',
  htmlAttrs: { lang: 'en' },
})

const { allowedHosts } = useRuntimeConfig().public
const { run, stop, messages, status, error } = useAgent('summarize')
const url = ref(`https://${allowedHosts[0]}/`)
</script>

<template>
  <UApp>
    <UContainer class="max-w-2xl space-y-8 py-12">
      <header class="space-y-2">
        <h1 class="text-2xl font-semibold">Page summarizer</h1>
        <p class="text-muted">
          A Markdown agent reads a web page with a server tool and summarizes it. The tool only
          reads HTTPS pages on {{ allowedHosts.join(', ') }}.
        </p>
      </header>

      <form
        class="flex flex-col gap-3 sm:flex-row"
        @submit.prevent="run(summarizeInput(url))"
      >
        <UInput
          v-model="url"
          type="url"
          required
          placeholder="https://nuxt.com/docs"
          aria-label="Page address"
          icon="i-lucide-link"
          class="flex-1"
        />
        <UButton
          v-if="status === 'running'"
          color="neutral"
          variant="outline"
          icon="i-lucide-square"
          label="Stop"
          @click="stop"
        />
        <UButton
          v-else
          type="submit"
          icon="i-lucide-sparkles"
          label="Summarize"
        />
      </form>

      <AgentRun
        :messages="messages"
        :status="status"
        :error="error"
      />

      <p class="text-xs text-muted">
        Runs on the mock provider with scripted replies. Set
        <code>provider</code>
        and
        <code>model</code>
        in
        <code>server/agents/summarize.md</code>
        to use a real model.
      </p>
    </UContainer>
  </UApp>
</template>
