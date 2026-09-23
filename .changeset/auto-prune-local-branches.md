---
"roo-code-2": patch
---

Enable automatic pruning of stale remote-tracking refs.

Adds `fetch.prune = true` and `push.autoSetupRemote = true` to the repository
`.gitconfig`. With `fetch.prune`, every fetch/pull now removes remote-tracking
refs whose branch has been deleted on the remote (for example by GitHub's
"automatically delete head branches" after a merge), so local no longer
accumulates zombie `origin/*` refs that must be cleaned by hand.
`push.autoSetupRemote` makes the first push of a new branch set its upstream
automatically.
