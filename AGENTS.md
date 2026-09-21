# AGENTS.md

This file provides guidance to agents when working with code in this repository.

- Settings View Pattern: When working on `SettingsView`, inputs must bind to the local `cachedState`, NOT the live `useExtensionState()`. The `cachedState` acts as a buffer for user edits, isolating them from the `ContextProxy` source-of-truth until the user explicitly clicks "Save". Wiring inputs directly to the live state causes race conditions.

## Version Management & Release Workflow

This repository (Roo Code) uses a **changesets + PR + CI** release pipeline. Follow it strictly:

1. **All changes go through a feature branch + Pull Request** targeting `main`. Never push directly to `main`.
2. **Every PR MUST include a `.changeset/*.md` file** declaring the version impact (`patch` / `minor` / `major`). Do NOT manually edit `src/package.json` version or create git tags. Version bumps, CHANGELOG.md updates, VSIX packaging, tagging, and Marketplace/Open VSX publishing are fully automated by GitHub Actions:
    - `changeset-release.yml` detects changesets on merge → creates a "Changeset version bump" PR → R00-B0T auto-approves and merges it
    - `marketplace-publish.yml` triggers on bump PR merge → packages VSIX, creates `vX.Y.Z` tag, publishes to Marketplace + Open VSX, creates GitHub Release
3. **CI must pass before merging**. The `code-qa.yml` workflow runs on every PR to `main`: lint, type-check, unit tests on both ubuntu and windows, translation completeness check, and knip (unused code detection).
4. **Local `npx turbo vsix` builds are for internal verification only.** The official release artifact is produced by CI (which injects secrets like `POSTHOG_API_KEY` and validates VSIX contents).
5. **Release preparation** (if manually preparing a release): follow `.roo/commands/release.md` — create a changeset + release PR, never bump versions directly.
