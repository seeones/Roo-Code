---
"roo-code-continue": patch
---

Fix Unbound model fetching: the `/models` endpoint now returns a dictionary keyed by model id with camelCase fields (e.g. `maxTokens`, `contextWindow`, `inputTokenPrice`), while the fetcher still expected an array with snake_case fields. This caused "response did not contain an array of models" errors and an empty model list. The fetcher now accepts both dictionary and array shapes, reads both camelCase and snake_case fields, and coerces numeric strings.
