---
"roo-code-continue": patch
---

Fix the Nightly build webview reload loop caused by a mismatched id prefix.

The Nightly build already rewrites the contributed `roo-cline.*` ids in `package.json` to the upstream nightly prefix (`roo-code-nightly.*`) via `generatePackageJson()`, but the bundled `extension.js` never received the matching `PKG_CONFIG_PREFIX`, so at runtime it registered `roo-cline.SidebarProvider` while VS Code looked for `roo-code-nightly.SidebarProvider`. VS Code could not resolve the provider and kept reloading the webview ("stuck in the start loop").

- In `apps/vscode-nightly/esbuild.mjs`, inject `process.env.PKG_CONFIG_PREFIX = "roo-code-nightly"` so the code-side config/command/view prefix matches the one emitted into `package.json`.
- Revert the substitution target in `apps/vscode-nightly/esbuild.mjs` from `roo-code-continue-nightly` back to the upstream `roo-code-nightly` so existing `roo-code-nightly.*` user settings keep working (mirroring how the stable extension keeps the `roo-cline` prefix for compatibility).
- Add the missing `views.sidebar.name` translation key in `apps/vscode-nightly/package.nls.nightly.json` so the sidebar name is "Roo Code Continue Nightly" instead of the merged default "Roo Code".
