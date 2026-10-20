<script setup lang="ts">
useHead({
  title: 'Daily digest',
  htmlAttrs: { lang: 'en' },
})

const { data: latest } = await useFetch('/api/digest')
const { run, stop, messages, status, error } = useAgent('digest')

const scheduledAt = computed(() =>
  latest.value
    ? new Date(latest.value.createdAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : undefined,
)
</script>

<template>
  <UApp>
    <UContainer class="max-w-2xl space-y-8 py-12">
      <header class="space-y-2">
        <h1 class="text-2xl font-semibold">Daily digest</h1>
        <p class="text-muted">
          A Nitro scheduled task runs a Markdown agent every morning at 07:00 UTC. The agent reads
          the team's activity with two tools and writes a short digest.
        </p>
      </header>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-2">
            <h2 class="font-medium">Latest scheduled digest</h2>
            <span
              v-if="scheduledAt"
              class="text-sm text-muted"
            >
              {{ scheduledAt }}
            </span>
          </div>
        </template>
        <p
          v-if="latest"
          class="text-sm leading-relaxed whitespace-pre-line"
        >
          {{ latest.text }}
        </p>
        <p
          v-else
          class="text-sm text-muted"
        >
          No digest yet. In development, open
          <ULink
            to="/_nitro/tasks/digest"
            external
            target="_blank"
            class="underline"
          >
            /_nitro/tasks/digest
          </ULink>
          to run the task, then reload.
        </p>
      </UCard>

      <section class="space-y-4">
        <div class="flex items-center justify-between gap-3">
          <h2 class="font-medium">Write one now</h2>
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
            icon="i-lucide-sparkles"
            label="Write digest"
            @click="run(digestInput())"
          />
        </div>
        <AgentRun
          :messages="messages"
          :status="status"
          :error="error"
        />
      </section>

      <p class="text-xs text-muted">
        Runs on the mock provider with scripted replies. Set
        <code>provider</code>
        and
        <code>model</code>
        in
        <code>server/agents/digest.md</code>
        to use a real model.
      </p>
    </UContainer>
  </UApp>
</template>
