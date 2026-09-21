---
"roo-code-continue": patch
---

Fix: Locate the ripgrep binary shipped by newer VS Code builds under `@vscode/ripgrep-universal` (e.g. `node_modules.asar.unpacked/@vscode/ripgrep-universal/bin/<platform>-<arch>/`), so workspace file listing no longer fails with "Could not find ripgrep binary" and tasks no longer hang silently when sending a message.
