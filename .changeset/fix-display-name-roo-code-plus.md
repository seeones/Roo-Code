---
"roo-code-2": patch
---

Fix the marketplace display name so publishing succeeds.

The default `src/package.nls.json` was missed in the previous rename pass and still
resolved `%extension.displayName%` to "Roo Code Continue", which is taken on the VS
Code Marketplace — `vsce publish` failed with "This extension display name is taken".

- Update the display name and all user-facing titles to "Roo Code Plus" in every
  `src/package.nls.*.json` (including the previously missed default `package.nls.json`).
- Keep the extension id `roo-code-2` unchanged.
