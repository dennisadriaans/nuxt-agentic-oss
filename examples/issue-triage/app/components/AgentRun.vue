<script setup lang="ts">
import type { AgentMessage, AgentRunStatus } from '@nuxtagentic/nuxt'

const {
  messages,
  status,
  error = '',
} = defineProps<{
  messages: readonly AgentMessage[]
  status: AgentRunStatus
  error?: string
}>()

const toolStates = {
  running: {
    label: 'Running',
    color: 'neutral',
    icon: 'i-lucide-loader-circle',
  },
  success: {
    label: 'Done',
    color: 'success',
    icon: 'i-lucide-check',
  },
  error: {
    label: 'Failed',
    color: 'error',
    icon: 'i-lucide-circle-x',
  },
  approval: {
    label: 'Needs approval',
    color: 'warning',
    icon: 'i-lucide-hand',
  },
} as const

const steps = computed(() =>
  messages.filter(
    (message): message is Extract<AgentMessage, { role: 'tool' }> => message.role === 'tool',
  ),
)
const answer = computed(() => messages.findLast((message) => message.role === 'assistant'))

function format(value: unknown) {
  return JSON.stringify(value, null, 2)
}
</script>

<template>
  <section
    class="space-y-4"
    aria-live="polite"
    :aria-busy="status === 'running'"
  >
    <ol
      v-if="steps.length"
      class="space-y-2"
    >
      <li
        v-for="step in steps"
        :key="step.callId"
      >
        <UCollapsible class="rounded-md border border-default">
          <UButton
            color="neutral"
            variant="ghost"
            block
            class="justify-between"
            trailing-icon="i-lucide-chevron-down"
          >
            <span class="flex items-center gap-2 font-mono text-sm">
              <UIcon
                :name="toolStates[step.status].icon"
                :class="{ 'animate-spin motion-reduce:animate-none': step.status === 'running' }"
              />
              {{ step.name }}
            </span>
            <UBadge
              :color="toolStates[step.status].color"
              variant="subtle"
              :label="toolStates[step.status].label"
              class="ms-auto"
            />
          </UButton>
          <template #content>
            <div class="space-y-2 border-t border-default p-3 text-xs">
              <p class="font-medium text-muted">Input</p>
              <pre class="overflow-x-auto">{{ format(step.input) }}</pre>
              <template v-if="step.status === 'success'">
                <p class="font-medium text-muted">Output</p>
                <pre class="overflow-x-auto">{{ format(step.output) }}</pre>
              </template>
              <p
                v-else-if="step.error"
                class="text-error"
              >
                {{ step.error }}
              </p>
            </div>
          </template>
        </UCollapsible>
      </li>
    </ol>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="The run failed"
      :description="error"
    />
    <UAlert
      v-else-if="status === 'stopped'"
      color="neutral"
      variant="subtle"
      icon="i-lucide-square"
      title="Stopped"
    />
    <div
      v-else-if="answer"
      class="rounded-md bg-elevated p-4 text-sm leading-relaxed whitespace-pre-line"
    >
      {{ answer.content }}
    </div>
  </section>
</template>
