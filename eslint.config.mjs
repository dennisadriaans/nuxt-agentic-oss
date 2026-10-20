import { createConfigForNuxt } from '@nuxt/eslint-config/flat'
import prettier from 'eslint-config-prettier/flat'

export default createConfigForNuxt({
  features: { stylistic: false },
  dirs: {
    src: [
      'examples/daily-digest/app',
      'examples/issue-triage/app',
      'examples/page-summarizer/app',
      'packages/nuxt/tests/fixtures/basic/app',
    ],
  },
})
  .prepend({
    ignores: [
      '**/node_modules/**',
      '**/.nuxt/**',
      '**/.output/**',
      '**/dist/**',
      '**/.wrangler/**',
    ],
  })
  .append(prettier, {
    name: 'nuxt-agentic/readability',
    rules: {
      curly: ['error', 'all'],
      'max-params': ['error', 4],
      'no-nested-ternary': 'error',
      'one-var': ['error', 'never'],
      'import/no-duplicates': ['error', { 'prefer-inline': true }],
    },
  })
