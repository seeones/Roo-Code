// npx vitest run src/core/context-tracking/__tests__/FileContextTracker.spec.ts

import { FileContextTracker } from "../FileContextTracker"
import type { TaskMetadata } from "../FileContextTrackerTypes"

vi.mock("vscode", () => ({
	Uri: { file: vi.fn((p: string) => ({ fsPath: p })) },
	RelativePattern: vi.fn(),
	EventEmitter: vi.fn(() => ({ event: vi.fn(), fire: vi.fn(), dispose: vi.fn() })),
	workspace: {
		createFileSystemWatcher: vi.fn(),
		workspaceFolders: [{ uri: { fsPath: "/mock/workspace" } }],
	},
}))

vi.mock("../../webview/ClineProvider", () => ({ ClineProvider: vi.fn() }))
vi.mock("../../../utils/safeWriteJson", () => ({ safeWriteJson: vi.fn().mockResolvedValue(undefined) }))

describe("FileContextTracker", () => {
	const mockProvider = {
		contextProxy: { globalStorageUri: { fsPath: "/mock/global-storage" } },
	} as any

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("adds a file entry and persists it via saveTaskMetadata", async () => {
		const tracker = new FileContextTracker(mockProvider, "task-1")

		const baseMetadata: TaskMetadata = { files_in_context: [] }
		vi.spyOn(tracker, "getTaskMetadata").mockResolvedValue(baseMetadata)
		const saveSpy = vi.spyOn(tracker, "saveTaskMetadata").mockResolvedValue(undefined)

		await tracker.addFileToFileContextTracker("task-1", "src/a.ts", "read_tool")

		expect(saveSpy).toHaveBeenCalledTimes(1)
		const saved = saveSpy.mock.calls[0][1] as TaskMetadata
		expect(saved.files_in_context).toHaveLength(1)
		expect(saved.files_in_context[0].path).toBe("src/a.ts")
		expect(saved.files_in_context[0].record_source).toBe("read_tool")
		expect(saved.files_in_context[0].record_state).toBe("active")
	})

	it("serializes concurrent updates so no entries are lost (no interleaved read-modify-write)", async () => {
		const tracker = new FileContextTracker(mockProvider, "task-1")

		// Simulate the on-disk state: only updated once a save actually completes.
		let diskMetadata: TaskMetadata = { files_in_context: [] }
		const gateResolvers: Array<() => void> = []
		const gate = () => new Promise<void>((resolve) => gateResolvers.push(resolve))

		const saveSpy = vi.spyOn(tracker, "saveTaskMetadata").mockImplementation(async (_taskId, metadata) => {
			await gate() // Slow write: hold each save open so callers overlap
			diskMetadata = metadata
		})
		vi.spyOn(tracker, "getTaskMetadata").mockImplementation(async () => diskMetadata)

		// Fire three concurrent updates (e.g. multiple tools/watchers touching files at once)
		const p1 = tracker.addFileToFileContextTracker("task-1", "src/a.ts", "read_tool")
		const p2 = tracker.addFileToFileContextTracker("task-1", "src/b.ts", "user_edited")
		const p3 = tracker.addFileToFileContextTracker("task-1", "src/c.ts", "roo_edited")

		// Release each save one at a time; with the lock, each subsequent call must
		// observe the state persisted by the previous one.
		for (let i = 0; i < 3; i++) {
			await vi.waitFor(() => {
				expect(gateResolvers.length).toBeGreaterThanOrEqual(i + 1)
			})
			gateResolvers[i]()
		}

		await Promise.all([p1, p2, p3])

		// Every update must have been persisted in order, with none lost.
		expect(saveSpy).toHaveBeenCalledTimes(3)
		expect(diskMetadata.files_in_context).toHaveLength(3)
		const paths = diskMetadata.files_in_context.map((entry) => entry.path)
		expect(paths).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"])
	})

	it("continues the lock chain when a save fails so later updates still persist", async () => {
		const tracker = new FileContextTracker(mockProvider, "task-1")

		let diskMetadata: TaskMetadata = { files_in_context: [] }
		const gateResolvers: Array<() => void> = []
		const gate = () => new Promise<void>((resolve) => gateResolvers.push(resolve))

		const saveSpy = vi.spyOn(tracker, "saveTaskMetadata").mockImplementation(async (_taskId, metadata) => {
			await gate()
			diskMetadata = metadata
		})
		// Mirror real behaviour: getTaskMetadata re-reads the persisted state from disk,
		// so un-persisted in-memory mutations from a failed save are NOT visible.
		vi.spyOn(tracker, "getTaskMetadata").mockImplementation(async () => ({
			files_in_context: [...diskMetadata.files_in_context],
		}))

		// The first save fails (e.g. a transient write error); the second must still run.
		saveSpy.mockRejectedValueOnce(new Error("Lock file is already being held"))

		const p1 = tracker.addFileToFileContextTracker("task-1", "src/a.ts", "read_tool")
		const p2 = tracker.addFileToFileContextTracker("task-1", "src/b.ts", "read_tool")

		// p1's save rejects immediately; p2 is queued behind the lock and runs afterwards.
		await vi.waitFor(() => {
			expect(saveSpy).toHaveBeenCalledTimes(2)
		})
		expect(gateResolvers).toHaveLength(1)

		gateResolvers[0]()

		await Promise.all([p1, p2])

		// The chain was not broken by p1's failure: p2 still read fresh state and persisted
		// its own update. (The failed write's entry is intentionally absent from disk.)
		expect(saveSpy).toHaveBeenCalledTimes(2)
		expect(diskMetadata.files_in_context.map((e) => e.path)).toEqual(["src/b.ts"])
	})
})
