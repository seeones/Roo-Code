---
"roo-code-continue": patch
---

Fix: code-index incremental updates now batch embeddings by the configured `codeIndex.embeddingBatchSize`, so a single large file no longer floods the embedder with oversized requests (SCNet gateway rejects batches over 20/25 items with 400 errors). Also serializes task-metadata read-modify-write cycles to eliminate concurrent lock contention on `task_metadata.json` (`Lock file is already being held`).
