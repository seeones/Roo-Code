import { beforeEach, describe, expect, it, vi } from "vitest"
import * as vscode from "vscode"

import { ClineProvider } from "../ClineProvider"
import { ContextProxy } from "../../config/ContextProxy"
import type { ProviderSettings } from "@roo-code/types"

// Mock dependencies
vi.mock("vscode", () => {
	const mockDisposable = { dispose: vi.fn() }
	return {
		ExtensionMode: {
			Production: 1,
			Development: 2,
		},
		workspace: {
			getConfiguration: vi.fn(() => ({
				get: vi.fn().mockReturnValue([]),
				update: vi.fn().mockResolvedValue(undefined),
			})),
			workspaceFolders: [],
			onDidChangeConfiguration: vi.fn(() => mockDisposable),
		},
		env: {
			uriScheme: "vscode",
			language: "en",
		},
		EventEmitter: vi.fn().mockImplementation(() => ({
			event: vi.fn(),
			fire: vi.fn(),
		})),
		Disposable: {
			from: vi.fn(),
		},
		window: {
			showErrorMessage: vi.fn(),
			showWarningMessage: vi.fn().mockResolvedValue(undefined),
			showInformationMessage: vi.fn(),
			createTextEditorDecorationType: vi.fn().mockReturnValue({
				dispose: vi.fn(),
			}),
			onDidChangeActiveTextEditor: vi.fn(() => mockDisposable),
		},
		Uri: {
			file: vi.fn().mockReturnValue({ toString: () => "file://test" }),
			joinPath: vi.fn().mockReturnValue({ toString: () => "vscode-webview://test" }),
		},
	}
})

vi.mock("../../task/Task")
vi.mock("../../config/ContextProxy")
vi.mock("../../../services/mcp/McpServerManager", () => ({
	McpServerManager: {
		getInstance: vi.fn().mockResolvedValue({
			registerClient: vi.fn(),
			unregisterClient: vi.fn(),
			getAllServers: vi.fn().mockReturnValue([]),
		}),
		unregisterProvider: vi.fn(),
	},
}))
vi.mock("../../../integrations/workspace/WorkspaceTracker")
vi.mock("../../config/ProviderSettingsManager")
vi.mock("../../config/CustomModesManager")
vi.mock("../../../utils/path", () => ({
	getWorkspacePath: vi.fn().mockReturnValue("/test/workspace"),
}))

vi.mock("../../../shared/embeddingModels", () => ({
	EMBEDDING_MODEL_PROFILES: [],
}))

describe("ClineProvider webview heartbeat monitoring", () => {
	let provider: ClineProvider
	let mockContext: any
	let mockOutputChannel: any
	let mockPostMessage: ReturnType<typeof vi.fn>
	let mockWebviewView: any

	const mockApiConfig: ProviderSettings = {
		apiProvider: "anthropic",
		apiKey: "test-key",
	} as ProviderSettings

	beforeEach(() => {
		vi.clearAllMocks()

		mockContext = {
			extensionUri: { fsPath: "/test/extension" },
			extensionMode: vscode.ExtensionMode.Production,
			globalState: {
				get: vi.fn().mockReturnValue(undefined),
				update: vi.fn().mockResolvedValue(undefined),
				keys: vi.fn().mockReturnValue([]),
			},
			globalStorageUri: { fsPath: "/test/storage" },
			secrets: {
				get: vi.fn().mockResolvedValue(undefined),
				store: vi.fn().mockResolvedValue(undefined),
				delete: vi.fn().mockResolvedValue(undefined),
			},
			workspaceState: {
				get: vi.fn().mockReturnValue(undefined),
				update: vi.fn().mockResolvedValue(undefined),
				keys: vi.fn().mockReturnValue([]),
			},
		}

		mockOutputChannel = {
			appendLine: vi.fn(),
			dispose: vi.fn(),
		}

		const mockContextProxy = {
			getValues: vi.fn().mockReturnValue({}),
			getValue: vi.fn().mockReturnValue(undefined),
			setValue: vi.fn().mockResolvedValue(undefined),
			getProviderSettings: vi.fn().mockReturnValue(mockApiConfig),
			extensionUri: mockContext.extensionUri,
			globalStorageUri: mockContext.globalStorageUri,
		}

		provider = new ClineProvider(mockContext, mockOutputChannel, "sidebar", mockContextProxy as any, {
			enableTaskHistoryWatcher: false,
		})

		mockPostMessage = vi.fn()
		mockWebviewView = {
			webview: {
				postMessage: mockPostMessage,
				html: "",
				options: {},
				onDidReceiveMessage: vi.fn(),
				asWebviewUri: vi.fn(),
				cspSource: "vscode-webview://test-csp-source",
			},
			visible: true,
			onDidDispose: vi.fn().mockImplementation(() => ({ dispose: vi.fn() })),
			onDidChangeVisibility: vi.fn().mockImplementation(() => ({ dispose: vi.fn() })),
		} as unknown as vscode.WebviewView
	})

	it("handlePong resets miss count and updates last pong timestamp", async () => {
		await provider.resolveWebviewView(mockWebviewView)

		// Simulate two missed heartbeats by advancing lastPongTimestamp
		;(provider as any).lastPongTimestamp = Date.now() - 100_000
		;(provider as any).heartbeatMissCount = 2

		provider.handlePong()

		expect((provider as any).heartbeatMissCount).toBe(0)
		expect((provider as any).lastPongTimestamp).toBeGreaterThanOrEqual(Date.now() - 1000)
	})

	it("stops heartbeat monitoring on dispose", async () => {
		await provider.resolveWebviewView(mockWebviewView)
		const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval")

		await provider.dispose()

		expect(clearIntervalSpy).toHaveBeenCalled()
		expect((provider as any).heartbeatInterval).toBeUndefined()
	})

	it("reloadWebview regenerates HTML and restarts heartbeat", async () => {
		await provider.resolveWebviewView(mockWebviewView)
		const startMonitoringSpy = vi.spyOn(provider as any, "startHeartbeatMonitoring")

		await provider.reloadWebview()

		expect(mockWebviewView.webview.html).not.toBe("")
		expect(startMonitoringSpy).toHaveBeenCalled()
	})

	it("reloadWebview handles missing webview gracefully", async () => {
		// No view resolved yet
		await provider.reloadWebview()

		expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
			expect.stringContaining("[Heartbeat] Cannot reload - no webview available"),
		)
	})

	it("reloadWebview shows error message when html regeneration throws", async () => {
		await provider.resolveWebviewView(mockWebviewView)
		const showErrorMessageSpy = vi.mocked(vscode.window.showErrorMessage)

		// Force getHtmlContent to throw
		vi.spyOn(provider as any, "getHtmlContent").mockRejectedValue(new Error("html generation failed"))

		await provider.reloadWebview()

		expect(showErrorMessageSpy).toHaveBeenCalledWith(
			"Failed to reload Roo Code panel. Please try reopening the panel manually.",
		)
	})
})
