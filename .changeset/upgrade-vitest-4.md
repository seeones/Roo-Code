---
"roo-code-continue": patch
---

Upgrade vitest to 4.1.11 and fix test compatibility.

- Root cause fix: vitest 4 no longer depends on `tinypool`, eliminating the Windows CI `ERR_IPC_CHANNEL_CLOSED` crashes in the changeset-release workflow.
- Update all vitest-related `package.json` manifests (src, webview-ui, and packages) to `^4.1.11`.
- Fix tests broken by the vitest 4 breaking change where `vi.fn(() => obj)` implementations are no longer constructible (arrow functions lack `[[Construct]]`): convert constructor mocks (`mockImplementation(() => ...)` / `mockImplementationOnce(() => ...)`) to semantically correct regular-function implementations across ~80 test files.
- Fix non-constructor regressions: `safeWriteJson.test.ts` (capture real `fs/promises` via `vi.hoisted` to avoid infinite recursion with reused spies), `custom-instructions-global.spec.ts` (mock queue leak), and `useEscapeKey.spec.ts` (restore spies between tests to prevent call-count leakage under vitest 4 spy reuse).
- Fix the residual Windows CI `Worker exited unexpectedly` crashes: `TaskHistoryStore.startWatcher()` was creating a real `fs.watch` in unit tests (via `ClineProvider` constructor), which hit the libuv `fs-event.c` native assertion when multiple watchers shared a directory being deleted. Add an `enableWatcher` option to `TaskHistoryStoreOptions` (default `true`) and an `enableTaskHistoryWatcher` option to `ClineProvider`, pass `false` in all unit tests, and add `TaskHistoryStore.watcher.spec.ts` covering watcher registration, debounced reconcile, close-on-dispose and the disabled case.
