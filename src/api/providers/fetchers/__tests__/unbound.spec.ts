import axios from "axios"

import { getUnboundModels } from "../unbound"

vitest.mock("axios")
const mockedAxios = axios as any

describe("getUnboundModels", () => {
	beforeEach(() => {
		vitest.clearAllMocks()
	})

	it("parses a dictionary response (current API shape) with camelCase fields", async () => {
		mockedAxios.get.mockResolvedValueOnce({
			data: {
				"anthropic/claude-haiku-4-5": {
					// The live API returns these as numeric strings.
					maxTokens: "32000",
					contextWindow: "200000",
					supportsImages: true,
					supportsPromptCaching: true,
					inputTokenPrice: "1.000000",
					outputTokenPrice: "5.000000",
					cacheReadPrice: "0.500000",
					cacheWritePrice: "6.250000",
					description: "Claude Haiku 4.5",
				},
				"openai/gpt-4o-mini": {
					maxTokens: 16384,
					contextWindow: 128000,
					supportsImages: false,
					supportsPromptCaching: false,
					inputTokenPrice: "0.15",
					outputTokenPrice: "0.60",
				},
			},
		})

		const models = await getUnboundModels("test-key")

		expect(mockedAxios.get).toHaveBeenCalledWith(
			"https://api.getunbound.ai/models",
			expect.objectContaining({ headers: { Authorization: "Bearer test-key" } }),
		)

		expect(Object.keys(models)).toEqual(["anthropic/claude-haiku-4-5", "openai/gpt-4o-mini"])

		const haiku = models["anthropic/claude-haiku-4-5"]
		expect(haiku.maxTokens).toBe(32000)
		expect(haiku.contextWindow).toBe(200000)
		expect(haiku.supportsImages).toBe(true)
		expect(haiku.supportsPromptCache).toBe(true)
		// parseApiPrice converts $/M tokens to micro-units
		expect(haiku.inputPrice).toBe(1_000_000)
		expect(haiku.outputPrice).toBe(5_000_000)
		expect(haiku.cacheReadsPrice).toBe(500_000)
		expect(haiku.cacheWritesPrice).toBe(6_250_000)
		expect(haiku.description).toBe("Claude Haiku 4.5")

		const mini = models["openai/gpt-4o-mini"]
		expect(mini.supportsImages).toBe(false)
		expect(mini.supportsPromptCache).toBe(false)
		expect(mini.inputPrice).toBe(150_000)
		expect(mini.outputPrice).toBe(600_000)
	})

	it("parses a legacy array response with snake_case fields", async () => {
		mockedAxios.get.mockResolvedValueOnce({
			data: [
				{
					id: "anthropic/claude-sonnet-4",
					max_output_tokens: 64000,
					context_window: 200000,
					supports_vision: true,
					supports_caching: true,
					input_price: "3.00",
					output_price: "15.00",
					caching_price: "3.75",
					cached_price: "0.30",
					description: "Claude Sonnet 4",
				},
			],
		})

		const models = await getUnboundModels()

		expect(Object.keys(models)).toEqual(["anthropic/claude-sonnet-4"])

		const model = models["anthropic/claude-sonnet-4"]
		expect(model.maxTokens).toBe(64000)
		expect(model.contextWindow).toBe(200000)
		expect(model.supportsImages).toBe(true)
		expect(model.supportsPromptCache).toBe(true)
		expect(model.inputPrice).toBe(3_000_000)
		expect(model.outputPrice).toBe(15_000_000)
		expect(model.cacheWritesPrice).toBe(3_750_000)
		expect(model.cacheReadsPrice).toBe(300_000)
	})

	it("handles a response wrapped in a data property", async () => {
		mockedAxios.get.mockResolvedValueOnce({
			data: {
				data: {
					"test/model": {
						maxTokens: 8192,
						contextWindow: 200000,
					},
				},
			},
		})

		const models = await getUnboundModels()

		expect(models["test/model"]).toBeDefined()
		expect(models["test/model"].maxTokens).toBe(8192)
	})

	it("applies defaults when fields are missing", async () => {
		mockedAxios.get.mockResolvedValueOnce({
			data: {
				"test/model": {
					// No fields provided
				},
			},
		})

		const models = await getUnboundModels()

		expect(models["test/model"].maxTokens).toBe(8192)
		expect(models["test/model"].contextWindow).toBe(200_000)
		expect(models["test/model"].supportsPromptCache).toBe(false)
		expect(models["test/model"].supportsImages).toBe(false)
		expect(models["test/model"].inputPrice).toBeUndefined()
		expect(models["test/model"].description).toBeUndefined()
	})

	it("returns empty object and logs an error when response is not an object or array", async () => {
		const consoleErrorSpy = vitest.spyOn(console, "error").mockImplementation(() => {})
		mockedAxios.get.mockResolvedValueOnce({ data: "not-an-object" })

		const models = await getUnboundModels()

		expect(models).toEqual({})
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			expect.stringContaining("response did not contain a models object or array"),
		)
		consoleErrorSpy.mockRestore()
	})

	it("handles API errors gracefully", async () => {
		const consoleErrorSpy = vitest.spyOn(console, "error").mockImplementation(() => {})
		mockedAxios.get.mockRejectedValueOnce(new Error("Network error"))

		const models = await getUnboundModels()

		expect(models).toEqual({})
		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Error fetching Unbound models"))
		consoleErrorSpy.mockRestore()
	})
})
