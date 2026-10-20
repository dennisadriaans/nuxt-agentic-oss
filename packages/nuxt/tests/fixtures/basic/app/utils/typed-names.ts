/** Never called: `nuxi typecheck` proves `useAgent()` only accepts agents in `server/agents`. */
export function typedAgentNames() {
  // @ts-expect-error -- there is no server/agents/missing.md
  useAgent('missing')

  return useAgent('triage')
}
