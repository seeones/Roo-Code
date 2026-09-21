---
"roo-code-continue": patch
---

Fork rebrand: rename extension to Roo Code Continue (publisher SeeonesStudio, repository seeones/Roo-Code).

Fix: tree-sitter language parser race condition when loading multiple languages concurrently (Language.load serialized with queue + Parser.init deduplication).

Fix: code index batch slots popover layout jumping (fixed slot rendering, idle slots always visible).
