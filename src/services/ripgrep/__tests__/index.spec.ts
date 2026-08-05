// npx vitest run src/services/ripgrep/__tests__/index.spec.ts

import * as path from "path"

import { getBinPath, truncateLine } from "../index"
import { fileExistsAtPath } from "../../../utils/fs"

vi.mock("../../../utils/fs", () => ({
	fileExistsAtPath: vi.fn(),
}))

const mockFileExistsAtPath = vi.mocked(fileExistsAtPath)

describe("Ripgrep line truncation", () => {
	// The default MAX_LINE_LENGTH is 500 in the implementation
	const MAX_LINE_LENGTH = 500

	it("should truncate lines longer than MAX_LINE_LENGTH", () => {
		const longLine = "a".repeat(600) // Line longer than MAX_LINE_LENGTH
		const truncated = truncateLine(longLine)

		expect(truncated).toContain("[truncated...]")
		expect(truncated.length).toBeLessThan(longLine.length)
		expect(truncated.length).toEqual(MAX_LINE_LENGTH + " [truncated...]".length)
	})

	it("should not truncate lines shorter than MAX_LINE_LENGTH", () => {
		const shortLine = "Short line of text"
		const truncated = truncateLine(shortLine)

		expect(truncated).toEqual(shortLine)
		expect(truncated).not.toContain("[truncated...]")
	})

	it("should correctly truncate a line at exactly MAX_LINE_LENGTH characters", () => {
		const exactLine = "a".repeat(MAX_LINE_LENGTH)
		const exactPlusOne = exactLine + "x"

		// Should not truncate when exactly MAX_LINE_LENGTH
		expect(truncateLine(exactLine)).toEqual(exactLine)

		// Should truncate when exceeding MAX_LINE_LENGTH by even 1 character
		expect(truncateLine(exactPlusOne)).toContain("[truncated...]")
	})

	it("should handle empty lines without errors", () => {
		expect(truncateLine("")).toEqual("")
	})

	it("should allow custom maximum length", () => {
		const customLength = 100
		const line = "a".repeat(customLength + 50)

		const truncated = truncateLine(line, customLength)

		expect(truncated.length).toEqual(customLength + " [truncated...]".length)
		expect(truncated).toContain("[truncated...]")
	})
})

describe("getBinPath", () => {
	const appRoot = "/vscode"
	const binName = process.platform.startsWith("win") ? "rg.exe" : "rg"

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should prefer the legacy @vscode/ripgrep path over the universal layout", async () => {
		const legacyPath = path.join(appRoot, "node_modules", "@vscode", "ripgrep", "bin", binName)
		mockFileExistsAtPath.mockImplementation(async (filePath: string) => filePath === legacyPath)

		await expect(getBinPath(appRoot)).resolves.toBe(legacyPath)
	})

	it("should fall back to the ripgrep-universal layout used by newer VS Code builds", async () => {
		const universalPath = path.join(
			appRoot,
			"node_modules.asar.unpacked",
			"@vscode",
			"ripgrep-universal",
			"bin",
			`${process.platform}-${process.arch}`,
			binName,
		)
		mockFileExistsAtPath.mockImplementation(async (filePath: string) => filePath === universalPath)

		await expect(getBinPath(appRoot)).resolves.toBe(universalPath)
	})

	it("should return undefined when no ripgrep binary exists", async () => {
		mockFileExistsAtPath.mockResolvedValue(false)

		await expect(getBinPath(appRoot)).resolves.toBeUndefined()
	})
})
