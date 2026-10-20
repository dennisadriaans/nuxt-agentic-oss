<script setup lang="ts">
const { run, stop, messages, status, error } = useAgent('triage')
const input = ref('')
</script>

<template>
  <main>
    <form @submit.prevent="run(input)">
      <input
        v-model="input"
        aria-label="Issue"
      />
      <button type="submit">Triage</button>
      <button
        type="button"
        :disabled="status !== 'running'"
        @click="stop"
      >
        Stop
      </button>
    </form>
    <p v-if="error">
      {{ error }}
    </p>
    <ol>
      <li
        v-for="(message, index) in messages"
        :key="index"
      >
        {{ message.role }}: {{ message.role === 'tool' ? message.name : message.content }}
      </li>
    </ol>
  </main>
</template>
