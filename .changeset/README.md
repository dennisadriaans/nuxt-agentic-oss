# Changesets

Every pull request that changes a public `@nuxtagentic/*` package adds a changeset:

```bash
pnpm changeset
```

Pick the bump (patch for fixes, minor for features) and describe the change for the changelog.
All public packages share one version. Maintainers run `pnpm version-packages` when they cut a release.
