---
"roo-code-2": patch
---

Fix release tags being created off `main`.

The marketplace publish workflow resolved `GIT_REF` from the pull request's `head.sha`. On a squash merge that head commit becomes an orphan, so the release tag (`git tag` on the checked-out ref) was created outside `main`'s history. `GIT_REF` now uses `merge_commit_sha`, which points at the commit actually on `main` for both merge and squash strategies, keeping every release tag on `main`. Also added a `merged == true` guard so the publish job never runs for a closed-but-unmerged PR.
