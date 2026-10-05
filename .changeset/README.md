# Changesets

This folder holds [changesets](https://github.com/changesets/changesets): one
Markdown file per change, declaring the semver bump and the release note.

Add one with `pnpm changeset` and commit it alongside your PR. On merge to
`main` the release workflow accumulates pending changesets into a "Release" PR;
merging that PR publishes.

Versioning is **fixed** — `untheme` and every `@untheme/*` package share one
version and release together, so a changeset for any of them bumps them all.
