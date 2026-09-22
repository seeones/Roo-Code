---
"roo-code-continue": patch
---

Fix nightly publish failing on the VS Code Marketplace.

- Rename the nightly build display name from "Roo Code Nightly" to "Roo Code Continue Nightly" (in `apps/vscode-nightly/package.nls.nightly.json`). The Marketplace requires display names to be globally unique across all publishers; "Roo Code Nightly" was already taken by another extension, causing `vsce publish` to fail with "This extension display name is taken".
