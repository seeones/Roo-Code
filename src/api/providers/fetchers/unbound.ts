import axios from "axios"

import type { ModelInfo } from "@roo-code/types"

import { parseApiPrice } from "../../../shared/cost"

// The Unbound /models endpoint has historically returned different shapes:
//  1. An array of model objects (with snake_case fields like `max_output_tokens`)
//  2. A dictionary keyed by model id, with camelCase fields (e.g. `maxTokens`,
//     `contextWindow`, `inputTokenPrice`) - this is what the API returns today.
// We normalize both shapes into a Record<modelId, ModelInfo>.
type UnboundRawModel = Record<string, unknown> & { id?: string }

function toEntries(rawModels: unknown): Array<[string, UnboundRawModel]> {
	if (Array.isArray(rawModels)) {
		const entries: Array<[string, UnboundRawModel]> = []

		for (const item of rawModels) {
			if (item && typeof item === "object") {
				const rawModel = item as UnboundRawModel
				const id = rawModel.id
				if (typeof id === "string" && id.length > 0) {
					entries.push([id, rawModel])
				}
			}
		}

		return entries
	}

	if (rawModels && typeof rawModels === "object") {
		return Object.entries(rawModels as Record<string, unknown>).map(([id, value]) => [
			id,
			(value && typeof value === "object" ? value : {}) as UnboundRawModel,
		])
	}

	return []
}

function pick(rawModel: UnboundRawModel, camelCase: string, snakeCase: string): unknown {
	return rawModel[camelCase] ?? rawModel[snakeCase]
}

function toFiniteNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value
	}

	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value)
		return Number.isFinite(parsed) ? parsed : undefined
	}

	return undefined
}

function parseUnboundModel(id: string, rawModel: UnboundRawModel): ModelInfo {
	const maxTokens = toFiniteNumber(pick(rawModel, "maxTokens", "max_output_tokens"))
	const contextWindow = toFiniteNumber(pick(rawModel, "contextWindow", "context_window"))
	const supportsPromptCache = pick(rawModel, "supportsPromptCaching", "supports_caching")
	const supportsImages = pick(rawModel, "supportsImages", "supports_vision")
	const inputTokenPrice = pick(rawModel, "inputTokenPrice", "input_price")
	const outputTokenPrice = pick(rawModel, "outputTokenPrice", "output_price")
	const cacheReadPrice = pick(rawModel, "cacheReadPrice", "cached_price")
	const cacheWritePrice = pick(rawModel, "cacheWritePrice", "caching_price")
	const description = pick(rawModel, "description", "description")

	return {
		maxTokens: maxTokens ?? 8192,
		contextWindow: contextWindow ?? 200_000,
		supportsPromptCache: supportsPromptCache === true,
		supportsImages: supportsImages === true,
		inputPrice: parseApiPrice(inputTokenPrice),
		outputPrice: parseApiPrice(outputTokenPrice),
		cacheReadsPrice: parseApiPrice(cacheReadPrice),
		cacheWritesPrice: parseApiPrice(cacheWritePrice),
		...(typeof description === "string" && description.length > 0 ? { description } : {}),
	}
}

export async function getUnboundModels(apiKey?: string | null): Promise<Record<string, ModelInfo>> {
	const models: Record<string, ModelInfo> = {}

	try {
		const headers: Record<string, string> = {}

		if (apiKey) {
			headers["Authorization"] = `Bearer ${apiKey}`
		}

		const response = await axios.get("https://api.getunbound.ai/models", { headers })
		const rawModels: unknown = response.data?.data ?? response.data

		if (rawModels === null || rawModels === undefined || typeof rawModels !== "object") {
			console.error("Error fetching Unbound models: response did not contain a models object or array")
			return models
		}

		for (const [id, rawModel] of toEntries(rawModels)) {
			models[id] = parseUnboundModel(id, rawModel)
		}
	} catch (error) {
		console.error(`Error fetching Unbound models: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
	}

	return models
}
