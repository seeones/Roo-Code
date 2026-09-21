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

import { reportWebviewError } from "../sourceMapInitializer"
import { vscode } from "../vscode"

const mockPostMessage = vi.mocked(vscode.postMessage)

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
