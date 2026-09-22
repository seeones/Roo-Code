# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Repository Background: Roo Code → Roo Code Continue

This repository is a **fork of [Roo Code](https://github.com/RooVetGit/Roo-Code)**, whose original upstream repository has been **archived and is no longer maintained**. In order to keep publishing to the VS Code Marketplace under this fork, the extension was renamed:

- **Extension identity** (`package.json` `name`): `roo-code-continue` (Nightly: `roo-code-continue-nightly`)
- **Display name** (via `package.nls.*.json` → `extension.displayName`): **"Roo Code Continue"** (Nightly: "Roo Code Continue Nightly")

When making changes, keep the following naming rules in mind:

- **User-facing / Marketplace-facing names** (display name, command titles, activity bar titles, README, i18n strings) should reference the new "Roo Code Continue" branding. Do NOT revert these to "Roo Code".
- **Internal identifiers that affect settings/import compatibility MUST keep the original `roo-cline` prefix.** This includes: VS Code `configuration` setting keys (e.g. `roo-cline.allowedCommands`, `roo-cline.customStoragePath`, `roo-cline.apiRequestTimeout`), commands (`roo-cline.plusButtonClicked`, ...), view/webview IDs (`roo-cline.SidebarProvider`), submenus, and keybindings. Renaming these would break existing user settings, keybindings, and the ability to import settings from the original Roo Code — so they must stay exactly as-is.
- The Nightly variant (in `apps/vscode-nightly/`) is generated at build time via `generatePackageJson()` which substitutes `roo-cline → roo-code-continue-nightly` for `contributes` keys only; settings `properties` keep the `roo-cline.` prefix for the same compatibility reason.
- `src/utils/migrateSettings.ts` handles legacy file-name migration (`cline_custom_modes.json`, `cline_mcp_settings.json`) and default-command cleanup; do not change the migrated file names.
- The VS Code Marketplace requires a **globally unique display name**. Before introducing a new display name, verify it is not already taken, otherwise `vsce publish` fails with "This extension display name is taken".

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
