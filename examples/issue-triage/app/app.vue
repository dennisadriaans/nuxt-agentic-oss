<script setup lang="ts">
useHead({
  title: 'Issue triage',
  htmlAttrs: { lang: 'en' },
})

const { data: issues } = await useFetch('/api/issues', { default: () => [] })
const { run, stop, messages, status, error } = useAgent('triage')

const selected = ref<number>()
const items = computed(() =>
  issues.value.map(({ number, title }) => ({
    label: `#${number} ${title}`,
    value: number,
  })),
)

function triage() {
  const issue = issues.value.find(({ number }) => number === selected.value)

  if (issue) {
    run(triageInput(issue))
  }
}
</script>

<template>
  <UApp>
    <UContainer class="max-w-2xl space-y-8 py-12">
      <header class="space-y-2">
        <h1 class="text-2xl font-semibold">Issue triage</h1>
        <p class="text-muted">
          A Markdown agent reads the issue, looks for duplicates and proposes labels. Adding labels
          needs a maintainer's approval, so that step is reported instead of run.
        </p>
      </header>

      <form
        class="flex flex-col gap-3 sm:flex-row"
        @submit.prevent="triage"
      >
        <USelect
          v-model="selected"
          :items="items"
          placeholder="Choose an issue"
          aria-label="Issue"
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
          label="Triage"
          :disabled="!selected"
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
        <code>server/agents/triage.md</code>
        to use a real model.
      </p>
    </UContainer>
  </UApp>
</template>
