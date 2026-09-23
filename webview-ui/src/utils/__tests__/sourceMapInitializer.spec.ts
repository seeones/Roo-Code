import { describe, expect, it, vi } from "vitest"

// Mock vscode API wrapper so reportWebviewError posts through it.
vi.mock("../vscode", () => {
	const postMessage = vi.fn()
	return {
		vscode: {
			postMessage,
		},
	}
})

import { initializeSourceMaps, reportWebviewError } from "../sourceMapInitializer"
import { vscode } from "../vscode"

const mockPostMessage = vi.mocked(vscode.postMessage)

describe("initializeSourceMaps preloading", () => {
	const originalNodeEnv = process.env.NODE_ENV
	const originalFetch = globalThis.fetch
	const originalCreateElement = document.createElement.bind(document)

	beforeEach(() => {
		process.env.NODE_ENV = "production"
		document.head.innerHTML = ""
		document.body.innerHTML = ""
		vi.restoreAllMocks()
	})

	afterEach(() => {
		process.env.NODE_ENV = originalNodeEnv
		globalThis.fetch = originalFetch
		document.createElement = originalCreateElement
	})

	it("preloads only the map referenced by sourceMappingURL", async () => {
		const scriptSrc = "vscode-webview://resource/assets/index-abc.js"
		const mapUrl = "vscode-webview://resource/assets/index-abc.js.map"

		const script = document.createElement("script")
		script.src = scriptSrc
		document.body.appendChild(script)

		// Fetch 1 = script content (contains sourceMappingURL), fetch 2 = the map probe.
		globalThis.fetch = vi
			.fn()
			.mockResolvedValueOnce({ text: async () => "//# sourceMappingURL=index-abc.js.map" } as Response)
			.mockResolvedValueOnce({ ok: true } as Response)

		initializeSourceMaps()

		// Let the promise chain resolve.
		await new Promise((resolve) => setTimeout(resolve, 0))

		expect(globalThis.fetch).toHaveBeenCalledTimes(2)
		expect(globalThis.fetch).toHaveBeenLastCalledWith(mapUrl)

		const preloads = document.head.querySelectorAll('link[rel="preload"]')
		expect(preloads).toHaveLength(1)
		expect(preloads[0].getAttribute("href")).toBe(mapUrl)
	})

	it("does not preload a source map that is missing (404)", async () => {
		const scriptSrc = "vscode-webview://resource/assets/index-abc.js"

		const script = document.createElement("script")
		script.src = scriptSrc
		document.body.appendChild(script)

		globalThis.fetch = vi
			.fn()
			.mockResolvedValueOnce({ text: async () => "//# sourceMappingURL=index-abc.js.map" } as Response)
			.mockResolvedValueOnce({ ok: false, status: 404 } as Response)

		initializeSourceMaps()

		await new Promise((resolve) => setTimeout(resolve, 0))

		expect(document.head.querySelectorAll('link[rel="preload"]')).toHaveLength(0)
	})

	it("does nothing when a script has no sourceMappingURL comment", async () => {
		const script = document.createElement("script")
		script.src = "vscode-webview://resource/assets/vendor.js"
		document.body.appendChild(script)

		globalThis.fetch = vi
			.fn()
			.mockResolvedValueOnce({ text: async () => "console.log('no source map')" } as Response)

		initializeSourceMaps()

		await new Promise((resolve) => setTimeout(resolve, 0))

		expect(globalThis.fetch).toHaveBeenCalledTimes(1)
		expect(document.head.querySelectorAll('link[rel="preload"]')).toHaveLength(0)
	})

	it("skips scripts without a src", async () => {
		// Only append a script element that is not yet connected to the DOM,
		// so jsdom does not try to execute it as an inline script.
		const script = document.createElement("script")

		const fetchSpy = vi.fn()
		globalThis.fetch = fetchSpy

		initializeSourceMaps()

		await new Promise((resolve) => setTimeout(resolve, 0))

		expect(fetchSpy).not.toHaveBeenCalled()

		// The detached script element is still collectable but never runs.
		expect(script.src).toBe("")
	})
})

describe("reportWebviewError", () => {
	it("posts a webviewError message with Error details", () => {
		const error = new Error("boom")
		error.stack = "Error: boom\n    at test.js:1:1"

		reportWebviewError(error, "error")

		expect(mockPostMessage).toHaveBeenCalledWith({
			type: "webviewError",
			webviewError: expect.objectContaining({
				message: "boom",
				stack: "Error: boom\n    at test.js:1:1",
				source: "error",
			}),
		})
	})

	it("stringifies non-Error payloads", () => {
		reportWebviewError("something went wrong", "unhandledrejection")

		expect(mockPostMessage).toHaveBeenCalledWith({
			type: "webviewError",
			webviewError: expect.objectContaining({
				message: "something went wrong",
				source: "unhandledrejection",
			}),
		})
	})

	it("includes componentStack when provided (errorboundary source)", () => {
		const error = new Error("render failed")

		reportWebviewError(error, "errorboundary", "at ChatView\nat App")

		expect(mockPostMessage).toHaveBeenCalledWith({
			type: "webviewError",
			webviewError: expect.objectContaining({
				message: "render failed",
				source: "errorboundary",
				componentStack: "at ChatView\nat App",
			}),
		})
	})

	it("never throws even if postMessage itself fails", () => {
		mockPostMessage.mockImplementationOnce(() => {
			throw new Error("postMessage failed")
		})

		expect(() => reportWebviewError(new Error("boom"), "error")).not.toThrow()
	})
})
