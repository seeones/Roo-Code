// npx vitest services/code-index/processors/__tests__/file-watcher.spec.ts

import * as vscode from "vscode"

import { FileWatcher } from "../file-watcher"
import { codeParser } from "../parser"

// Mock dependencies
vi.mock("../../cache-manager")
vi.mock("../../../core/ignore/RooIgnoreController", () => ({
	RooIgnoreController: vi.fn().mockImplementation(function () {
		return {
			validateAccess: vi.fn().mockReturnValue(true),
		}
	}),
}))
vi.mock("ignore")
vi.mock("../parser", () => ({
	codeParser: {
		parseFile: vi.fn().mockResolvedValue([]),
	},
}))
vi.mock("../../../glob/ignore-utils", () => ({
	isPathInIgnoredDirectory: vi.fn().mockReturnValue(false),
}))

// Mock vscode module
vi.mock("vscode", () => ({
	workspace: {
		createFileSystemWatcher: vi.fn(),
		workspaceFolders: [
			{
				uri: {
					fsPath: "/mock/workspace",
				},
			},
		],
		fs: {
			stat: vi.fn().mockResolvedValue({ size: 1000 }),
			readFile: vi.fn().mockResolvedValue(Buffer.from("test content")),
		},
	},
	RelativePattern: vi.fn().mockImplementation(function (base, pattern) {
		return { base, pattern }
	}),
	Uri: {
		file: vi.fn().mockImplementation((path) => ({ fsPath: path })),
	},
	EventEmitter: vi.fn().mockImplementation(function () {
		return {
			event: vi.fn(),
			fire: vi.fn(),
			dispose: vi.fn(),
		}
	}),
	ExtensionContext: vi.fn(),
}))

describe("FileWatcher", () => {
	let fileWatcher: FileWatcher
	let mockWatcher: any
	let mockOnDidCreate: any
	let mockOnDidChange: any
	let mockOnDidDelete: any
	let mockContext: any
	let mockCacheManager: any
	let mockEmbedder: any
	let mockVectorStore: any
	let mockIgnoreInstance: any

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks()

		// Create mock event handlers
		mockOnDidCreate = vi.fn()
		mockOnDidChange = vi.fn()
		mockOnDidDelete = vi.fn()

		// Create mock watcher
		mockWatcher = {
			onDidCreate: vi.fn().mockImplementation((handler) => {
				mockOnDidCreate = handler
				return { dispose: vi.fn() }
			}),
			onDidChange: vi.fn().mockImplementation((handler) => {
				mockOnDidChange = handler
				return { dispose: vi.fn() }
			}),
			onDidDelete: vi.fn().mockImplementation((handler) => {
				mockOnDidDelete = handler
				return { dispose: vi.fn() }
			}),
			dispose: vi.fn(),
		}

		// Mock createFileSystemWatcher to return our mock watcher
		vi.mocked(vscode.workspace.createFileSystemWatcher).mockReturnValue(mockWatcher)

		// Create mock dependencies
		mockContext = {
			subscriptions: [],
		}

		mockCacheManager = {
			getHash: vi.fn(),
			updateHash: vi.fn(),
			deleteHash: vi.fn(),
		}

		mockEmbedder = {
			createEmbeddings: vi.fn().mockResolvedValue({ embeddings: [[0.1, 0.2, 0.3]] }),
		}

		mockVectorStore = {
			upsertPoints: vi.fn().mockResolvedValue(undefined),
			deletePointsByFilePath: vi.fn().mockResolvedValue(undefined),
			deletePointsByMultipleFilePaths: vi.fn().mockResolvedValue(undefined),
		}

		mockIgnoreInstance = {
			ignores: vi.fn().mockReturnValue(false),
		}

		fileWatcher = new FileWatcher(
			"/mock/workspace",
			mockContext,
			mockCacheManager,
			mockEmbedder,
			mockVectorStore,
			mockIgnoreInstance,
		)
	})

	describe("file filtering", () => {
		it("should ignore files in hidden directories on create events", async () => {
			// Initialize the file watcher
			await fileWatcher.initialize()

			// Spy on the vector store to see which files are actually processed
			const processedFiles: string[] = []
			mockVectorStore.upsertPoints.mockImplementation(async (points: any[]) => {
				points.forEach((point) => {
					if (point.payload?.file_path) {
						processedFiles.push(point.payload.file_path)
					}
				})
			})

			// Simulate file creation events
			const testCases = [
				{ path: "/mock/workspace/src/file.ts", shouldProcess: true },
				{ path: "/mock/workspace/.git/config", shouldProcess: false },
				{ path: "/mock/workspace/.hidden/file.ts", shouldProcess: false },
				{ path: "/mock/workspace/src/.next/static/file.js", shouldProcess: false },
				{ path: "/mock/workspace/node_modules/package/index.js", shouldProcess: false },
				{ path: "/mock/workspace/normal/file.js", shouldProcess: true },
			]

			// Trigger file creation events
			for (const { path } of testCases) {
				await mockOnDidCreate({ fsPath: path })
			}

			// Wait for batch processing
			await new Promise((resolve) => setTimeout(resolve, 600))

			// Check that files in hidden directories were not processed
			expect(processedFiles).not.toContain("src/.next/static/file.js")
			expect(processedFiles).not.toContain(".git/config")
			expect(processedFiles).not.toContain(".hidden/file.ts")
		})

		it("should ignore files in hidden directories on change events", async () => {
			// Initialize the file watcher
			await fileWatcher.initialize()

			// Track which files are processed
			const processedFiles: string[] = []
			mockVectorStore.upsertPoints.mockImplementation(async (points: any[]) => {
				points.forEach((point) => {
					if (point.payload?.file_path) {
						processedFiles.push(point.payload.file_path)
					}
				})
			})

			// Simulate file change events
			const testCases = [
				{ path: "/mock/workspace/src/file.ts", shouldProcess: true },
				{ path: "/mock/workspace/.vscode/settings.json", shouldProcess: false },
				{ path: "/mock/workspace/src/.cache/data.json", shouldProcess: false },
				{ path: "/mock/workspace/dist/bundle.js", shouldProcess: false },
			]

			// Trigger file change events
			for (const { path } of testCases) {
				await mockOnDidChange({ fsPath: path })
			}

			// Wait for batch processing
			await new Promise((resolve) => setTimeout(resolve, 600))

			// Check that files in hidden directories were not processed
			expect(processedFiles).not.toContain(".vscode/settings.json")
			expect(processedFiles).not.toContain("src/.cache/data.json")
		})

		it("should ignore files in hidden directories on delete events", async () => {
			// Initialize the file watcher
			await fileWatcher.initialize()

			// Track which files are deleted
			const deletedFiles: string[] = []
			mockVectorStore.deletePointsByFilePath.mockImplementation(async (filePath: string) => {
				deletedFiles.push(filePath)
			})

			// Simulate file deletion events
			const testCases = [
				{ path: "/mock/workspace/src/file.ts", shouldProcess: true },
				{ path: "/mock/workspace/.git/objects/abc123", shouldProcess: false },
				{ path: "/mock/workspace/.DS_Store", shouldProcess: false },
				{ path: "/mock/workspace/build/.cache/temp.js", shouldProcess: false },
			]

			// Trigger file deletion events
			for (const { path } of testCases) {
				await mockOnDidDelete({ fsPath: path })
			}

			// Wait for batch processing
			await new Promise((resolve) => setTimeout(resolve, 600))

			// Check that files in hidden directories were not processed
			expect(deletedFiles).not.toContain(".git/objects/abc123")
			expect(deletedFiles).not.toContain(".DS_Store")
			expect(deletedFiles).not.toContain("build/.cache/temp.js")
		})

		it("should handle nested hidden directories correctly", async () => {
			// Initialize the file watcher
			await fileWatcher.initialize()

			// Track which files are processed
			const processedFiles: string[] = []
			mockVectorStore.upsertPoints.mockImplementation(async (points: any[]) => {
				points.forEach((point) => {
					if (point.payload?.file_path) {
						processedFiles.push(point.payload.file_path)
					}
				})
			})

			// Test deeply nested hidden directories
			const testCases = [
				{ path: "/mock/workspace/src/components/Button.tsx", shouldProcess: true },
				{ path: "/mock/workspace/src/.hidden/components/Button.tsx", shouldProcess: false },
				{ path: "/mock/workspace/.hidden/src/components/Button.tsx", shouldProcess: false },
				{ path: "/mock/workspace/src/components/.hidden/Button.tsx", shouldProcess: false },
			]

			// Trigger file creation events
			for (const { path } of testCases) {
				await mockOnDidCreate({ fsPath: path })
			}

			// Wait for batch processing
			await new Promise((resolve) => setTimeout(resolve, 600))

			// Check that files in hidden directories were not processed
			expect(processedFiles).not.toContain("src/.hidden/components/Button.tsx")
			expect(processedFiles).not.toContain(".hidden/src/components/Button.tsx")
			expect(processedFiles).not.toContain("src/components/.hidden/Button.tsx")
		})
	})

	describe("embedding batching", () => {
		it("should split a single file's blocks into batches matching the configured embedding batch size", async () => {
			// Create a FileWatcher with an explicit small batch size (e.g. user config sets 5)
			const batchedWatcher = new FileWatcher(
				"/mock/workspace",
				mockContext,
				mockCacheManager,
				mockEmbedder,
				mockVectorStore,
				mockIgnoreInstance,
				undefined,
				5,
			)

			// Mock the parser to return 12 code blocks
			const mockBlocks = Array.from({ length: 12 }, (_, index) => ({
				file_path: `/mock/workspace/src/file.ts`,
				content: `block ${index}`,
				start_line: index * 10 + 1,
				end_line: index * 10 + 10,
			}))
			vi.mocked(codeParser.parseFile).mockResolvedValue(mockBlocks as any)

			// Embedder returns a vector derived from the text so we can verify
			// embeddings are correctly spliced back together across batches
			mockEmbedder.createEmbeddings.mockImplementation(async (texts: string[]) => ({
				embeddings: texts.map((text) => {
					const blockIndex = Number(text.split(" ")[1])
					return [blockIndex, 0.5, 0.25]
				}),
			}))

			// Simulate no prior hash so the file is not skipped
			mockCacheManager.getHash.mockReturnValue(undefined)

			const result = await batchedWatcher.processFile("/mock/workspace/src/file.ts")

			expect(result.status).toBe("processed_for_batching")
			// 12 blocks / batch size 5 => 3 calls (5, 5, 2)
			expect(mockEmbedder.createEmbeddings).toHaveBeenCalledTimes(3)
			expect(mockEmbedder.createEmbeddings).toHaveBeenNthCalledWith(1, [
				"block 0",
				"block 1",
				"block 2",
				"block 3",
				"block 4",
			])
			expect(mockEmbedder.createEmbeddings).toHaveBeenNthCalledWith(2, [
				"block 5",
				"block 6",
				"block 7",
				"block 8",
				"block 9",
			])
			expect(mockEmbedder.createEmbeddings).toHaveBeenNthCalledWith(3, ["block 10", "block 11"])

			// All 12 points should be produced with the correct embeddings
			expect(result.pointsToUpsert).toHaveLength(12)
			expect(result.pointsToUpsert![0].vector).toEqual([0, 0.5, 0.25])
			expect(result.pointsToUpsert![11].vector).toEqual([11, 0.5, 0.25])
		})

		it("should make a single embedding call when blocks fit within the batch size", async () => {
			const mockBlocks = [
				{
					file_path: "/mock/workspace/src/file.ts",
					content: "block a",
					start_line: 1,
					end_line: 10,
				},
				{
					file_path: "/mock/workspace/src/file.ts",
					content: "block b",
					start_line: 11,
					end_line: 20,
				},
			]
			vi.mocked(codeParser.parseFile).mockResolvedValue(mockBlocks as any)
			mockEmbedder.createEmbeddings.mockImplementation(async (texts: string[]) => ({
				embeddings: texts.map((_, i) => [i, 0.1]),
			}))
			mockCacheManager.getHash.mockReturnValue(undefined)

			const result = await fileWatcher.processFile("/mock/workspace/src/file.ts")

			expect(result.status).toBe("processed_for_batching")
			expect(mockEmbedder.createEmbeddings).toHaveBeenCalledTimes(1)
			expect(mockEmbedder.createEmbeddings).toHaveBeenCalledWith(["block a", "block b"])
			expect(result.pointsToUpsert).toHaveLength(2)
		})

		it("should not call the embedder when the file has no parseable blocks", async () => {
			vi.mocked(codeParser.parseFile).mockResolvedValue([])
			mockCacheManager.getHash.mockReturnValue(undefined)

			const result = await fileWatcher.processFile("/mock/workspace/src/file.ts")

			expect(result.status).toBe("processed_for_batching")
			expect(mockEmbedder.createEmbeddings).not.toHaveBeenCalled()
			expect(result.pointsToUpsert).toHaveLength(0)
		})
	})

	describe("dispose", () => {
		it("should dispose of the watcher when disposed", async () => {
			await fileWatcher.initialize()
			fileWatcher.dispose()

			expect(mockWatcher.dispose).toHaveBeenCalled()
		})
	})
})
