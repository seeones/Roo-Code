// pnpm --filter roo-cline test core/task-persistence/__tests__/TaskHistoryStore.watcher.spec.ts

import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"

import type { HistoryItem } from "@roo-code/types"

import { TaskHistoryStore } from "../TaskHistoryStore"
import { GlobalFileNames } from "../../../shared/globalFileNames"

vi.mock("../../../utils/storage", () => ({
	getStorageBasePath: vi.fn().mockImplementation((defaultPath: string) => defaultPath),
}))

// Mock safeWriteJson to use plain fs writes in tests (avoids proper-lockfile issues)
vi.mock("../../../utils/safeWriteJson", () => ({
	safeWriteJson: vi.fn().mockImplementation(async (filePath: string, data: any) => {
		await fs.mkdir(path.dirname(filePath), { recursive: true })
		await fs.writeFile(filePath, JSON.stringify(data, null, "\t"), "utf8")
	}),
}))

// Mock the sync `fs` module's watch() so no real watcher is ever created.
// TaskHistoryStore imports it as `import * as fsSync from "fs"` (line 2) and only
// ever calls `fsSync.watch(...)` from startWatcher(). The mock returns a fake
// FSWatcher so we can assert registration, callback and close behavior.
const { mockWatch, mockWatcher } = vi.hoisted(() => {
	const watcher = {
		on: vi.fn(),
		close: vi.fn(),
	}
	return {
		mockWatch: vi.fn(
			(
				_dir: string,
				_options: { recursive: boolean },
				_listener: (eventType: string, filename: string | null) => void,
			) => watcher,
		),
		mockWatcher: watcher,
	}
})

vi.mock("fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("fs")>()
	return {
		...actual,
		watch: mockWatch,
	}
})

function makeHistoryItem(overrides: Partial<HistoryItem> = {}): HistoryItem {
	return {
		id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
		number: 1,
		ts: Date.now(),
		task: "Test task",
		tokensIn: 100,
		tokensOut: 50,
		totalCost: 0.01,
		workspace: "/test/workspace",
		...overrides,
	}
}

describe("TaskHistoryStore watcher", () => {
	let tmpDir: string

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "task-history-watcher-"))
		mockWatch.mockClear()
		mockWatcher.on.mockClear()
		mockWatcher.close.mockClear()
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
	})

	it("starts a real fs.watch on the tasks dir when enableWatcher is true (default)", async () => {
		const store = new TaskHistoryStore(tmpDir)
		await store.initialize()

		await vi.waitFor(() => {
			expect(mockWatch).toHaveBeenCalledTimes(1)
		})

		const [watchedDir, options] = mockWatch.mock.calls[0]
		expect(watchedDir).toBe(path.join(tmpDir, "tasks"))
		expect(options).toEqual({ recursive: false })

		// The watcher must be wired up for error reporting
		expect(mockWatcher.on).toHaveBeenCalledWith("error", expect.any(Function))

		store.dispose()
	})

	it("reconciles when the watcher callback fires (debounced)", async () => {
		const store = new TaskHistoryStore(tmpDir)
		await store.initialize()

		await vi.waitFor(() => {
			expect(mockWatch).toHaveBeenCalled()
		})

		// Simulate another instance writing a task while this store is idle
		const item = makeHistoryItem({ id: "task-abc", ts: 1000 })
		const taskDir = path.join(tmpDir, "tasks", item.id)
		await fs.mkdir(taskDir, { recursive: true })
		await fs.writeFile(path.join(taskDir, GlobalFileNames.historyItem), JSON.stringify(item), "utf8")

		expect(store.get(item.id)).toBeUndefined()

		// Fire the fs.watch callback (dir, options, listener) -> listener is arg [2]
		const listener = mockWatch.mock.calls[0][2] as (eventType: string, filename: string | null) => void
		listener("rename", item.id)

		// Wait for the 500ms debounce + reconcile
		await vi.waitFor(() => {
			expect(store.get(item.id)).toEqual(expect.objectContaining({ id: item.id }))
		})

		store.dispose()
	})

	it("closes the watcher on dispose", async () => {
		const store = new TaskHistoryStore(tmpDir)
		await store.initialize()

		await vi.waitFor(() => {
			expect(mockWatch).toHaveBeenCalledTimes(1)
		})

		expect(mockWatcher.close).not.toHaveBeenCalled()

		store.dispose()

		expect(mockWatcher.close).toHaveBeenCalledTimes(1)
	})

	it("does not start a watcher when enableWatcher is false", async () => {
		const store = new TaskHistoryStore(tmpDir, { enableWatcher: false })
		await store.initialize()

		// Give the async startWatcher() chain a chance to run (it is fire-and-forget)
		await new Promise((resolve) => setTimeout(resolve, 20))

		expect(mockWatch).not.toHaveBeenCalled()

		store.dispose()
		expect(mockWatcher.close).not.toHaveBeenCalled()
	})
})
