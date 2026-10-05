# Changesets

This folder holds [changesets](https://github.com/changesets/changesets): one
Markdown file per change, declaring the semver bump and the release note.

Add one with `pnpm changeset` and commit it alongside your PR. Releases are
manual: running the Release workflow (`gh workflow run Release`) applies every
pending changeset, commits the version bump, and publishes to npm.

Versioning is **fixed** — `fibber-lang` and every `@fibber/*` package share one
version and release together, so a changeset for any of them bumps them all.
