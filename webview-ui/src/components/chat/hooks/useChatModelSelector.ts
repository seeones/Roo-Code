import { useCallback, useEffect, useMemo, useState } from "react"
import { useEvent } from "react-use"

import {
	type ProviderName,
	type ProviderSettings,
	type ModelInfo,
	type ModelRecord,
	type ExtensionMessage,
	type LanguageModelChatSelector,
	openAiModelInfoSaneDefaults,
	anthropicDefaultModelId,
	bedrockDefaultModelId,
	deepSeekDefaultModelId,
	moonshotDefaultModelId,
	geminiDefaultModelId,
	mistralDefaultModelId,
	openAiNativeDefaultModelId,
	qwenCodeDefaultModelId,
	vertexDefaultModelId,
	xaiDefaultModelId,
	sambaNovaDefaultModelId,
	internationalZAiDefaultModelId,
	mainlandZAiDefaultModelId,
	fireworksDefaultModelId,
	minimaxDefaultModelId,
	basetenDefaultModelId,
	openRouterDefaultModelId,
	requestyDefaultModelId,
	unboundDefaultModelId,
	litellmDefaultModelId,
	vercelAiGatewayDefaultModelId,
	poeDefaultModelId,
	isRetiredProvider,
} from "@roo-code/types"

import { useRouterModels } from "@/components/ui/hooks/useRouterModels"
import { getStaticModelsForProvider } from "@/components/settings/utils/providerModelConfig"
import { MODELS_BY_PROVIDER } from "@/components/settings/constants"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { vscode } from "@/utils/vscode"

type ModelIdKey = keyof Pick<
	ProviderSettings,
	| "openRouterModelId"
	| "requestyModelId"
	| "unboundModelId"
	| "openAiModelId"
	| "litellmModelId"
	| "vercelAiGatewayModelId"
	| "apiModelId"
	| "ollamaModelId"
	| "lmStudioModelId"
	| "vsCodeLmModelSelector"
>

const STATIC_DEFAULT_MODEL_IDS: Partial<Record<ProviderName, string>> = {
	anthropic: anthropicDefaultModelId,
	bedrock: bedrockDefaultModelId,
	deepseek: deepSeekDefaultModelId,
	moonshot: moonshotDefaultModelId,
	gemini: geminiDefaultModelId,
	mistral: mistralDefaultModelId,
	"openai-native": openAiNativeDefaultModelId,
	"qwen-code": qwenCodeDefaultModelId,
	vertex: vertexDefaultModelId,
	xai: xaiDefaultModelId,
	sambanova: sambaNovaDefaultModelId,
	zai: internationalZAiDefaultModelId,
	fireworks: fireworksDefaultModelId,
	minimax: minimaxDefaultModelId,
	baseten: basetenDefaultModelId,
}

const ROUTER_DEFAULT_MODEL_IDS: Partial<Record<ProviderName, string>> = {
	openrouter: openRouterDefaultModelId,
	requesty: requestyDefaultModelId,
	unbound: unboundDefaultModelId,
	litellm: litellmDefaultModelId,
	"vercel-ai-gateway": vercelAiGatewayDefaultModelId,
	poe: poeDefaultModelId,
}

// Providers whose model list is delivered through a dedicated message event
// (mirrors the settings page provider components).
const MESSAGE_BASED_PROVIDERS: ProviderName[] = ["openai", "ollama", "lmstudio", "vscode-lm"]

export interface ChatModelSelectorData {
	/** The provider key used to determine model source (undefined for retired providers). */
	provider: ProviderName | undefined
	/** Record of available models for the current provider (null until loaded or when N/A). */
	models: Record<string, ModelInfo> | null
	/** The configuration field key that stores the selected model for this provider. */
	modelIdKey: ModelIdKey | undefined
	/** The default model id for this provider. */
	defaultModelId: string
	/** Whether the model list is still loading. */
	isLoading: boolean
	/** Transform a selected model id into the stored configuration value (e.g. VSCode LM selector object). */
	valueTransform?: (modelId: string) => unknown
	/** Transform the stored configuration value back to a display string (e.g. VSCode LM selector). */
	displayTransform?: (value: unknown) => string
}

/**
 * Resolves the model list, storage key and defaults for the currently active
 * provider so the chat input bar can render a compact model picker.
 *
 * The data sources mirror the settings page (`ApiOptions` and the provider
 * components) so the chat selector shows the exact same models:
 * - Router providers (openrouter, requesty, unbound, vercel-ai-gateway):
 *   react-query `useRouterModels` request.
 * - litellm / poe: backend-broadcast `routerModels` from extension state.
 * - openai (OpenAI compatible), ollama, lmstudio, vscode-lm: request on mount
 *   and listen for the corresponding `*Models` message event.
 * - Static providers: `getStaticModelsForProvider`.
 */
export const useChatModelSelector = (): ChatModelSelectorData => {
	const { apiConfiguration, routerModels: stateRouterModels } = useExtensionState()

	const provider = (apiConfiguration?.apiProvider || "openrouter") as ProviderName
	const activeProvider = isRetiredProvider(provider) ? undefined : provider

	// Router providers are fetched through react-query (mirrors ApiOptions).
	const routerModels = useRouterModels({
		provider: activeProvider,
		enabled: !!activeProvider && ROUTER_DEFAULT_MODEL_IDS[activeProvider] !== undefined,
	})

	// Message-based providers: request the models on mount and keep the
	// latest list delivered by the backend.
	const [openAiModels, setOpenAiModels] = useState<string[]>([])
	const [ollamaModels, setOllamaModels] = useState<ModelRecord>({})
	const [lmStudioModels, setLmStudioModels] = useState<ModelRecord>({})
	const [vsCodeLmModels, setVsCodeLmModels] = useState<LanguageModelChatSelector[]>([])

	const onMessage = useCallback((event: MessageEvent) => {
		const message: ExtensionMessage = event.data
		switch (message.type) {
			case "openAiModels":
				setOpenAiModels(message.openAiModels ?? [])
				break
			case "ollamaModels":
				setOllamaModels(message.ollamaModels ?? {})
				break
			case "lmStudioModels":
				setLmStudioModels(message.lmStudioModels ?? {})
				break
			case "vsCodeLmModels":
				setVsCodeLmModels(message.vsCodeLmModels ?? [])
				break
		}
	}, [])
	useEvent("message", onMessage)

	// Request models on mount when a message-based provider is active
	// (mirrors Ollama.tsx / LMStudio.tsx / OpenAICompatible.tsx behaviors).
	useEffect(() => {
		if (!activeProvider || !MESSAGE_BASED_PROVIDERS.includes(activeProvider)) {
			return
		}

		switch (activeProvider) {
			case "openai":
				if (apiConfiguration?.openAiBaseUrl && apiConfiguration?.openAiApiKey) {
					vscode.postMessage({
						type: "requestOpenAiModels",
						values: {
							baseUrl: apiConfiguration.openAiBaseUrl,
							apiKey: apiConfiguration.openAiApiKey,
							customHeaders: {},
							openAiHeaders: apiConfiguration.openAiHeaders ?? {},
						},
					})
				}
				break
			case "ollama":
				vscode.postMessage({ type: "requestOllamaModels" })
				break
			case "lmstudio":
				vscode.postMessage({ type: "requestLmStudioModels" })
				break
			case "vscode-lm":
				vscode.postMessage({ type: "requestVsCodeLmModels" })
				break
		}
	}, [
		activeProvider,
		apiConfiguration?.openAiBaseUrl,
		apiConfiguration?.openAiApiKey,
		apiConfiguration?.openAiHeaders,
	])

	// Map provider -> config field key + model list + default id.
	const result = useMemo<ChatModelSelectorData>(() => {
		if (!activeProvider) {
			return {
				provider: undefined,
				models: null,
				modelIdKey: undefined,
				defaultModelId: "",
				isLoading: false,
			}
		}

		const defaultModelId =
			(activeProvider === "zai" && apiConfiguration?.zaiApiLine === "china_coding"
				? mainlandZAiDefaultModelId
				: (ROUTER_DEFAULT_MODEL_IDS[activeProvider] ?? STATIC_DEFAULT_MODEL_IDS[activeProvider] ?? "")) ?? ""

		let models: Record<string, ModelInfo> | null = null
		let modelIdKey: ModelIdKey | undefined = undefined
		let valueTransform: ((modelId: string) => unknown) | undefined
		let displayTransform: ((value: unknown) => string) | undefined
		let isLoading = false

		switch (activeProvider) {
			case "openrouter":
				models = routerModels.data?.openrouter ?? null
				modelIdKey = "openRouterModelId"
				break
			case "requesty":
				models = routerModels.data?.requesty ?? null
				modelIdKey = "requestyModelId"
				break
			case "unbound":
				models = routerModels.data?.unbound ?? null
				modelIdKey = "unboundModelId"
				break
			case "litellm":
				// The settings page reads litellm models from the backend
				// broadcast cache (stateRouterModels), not from react-query.
				models = stateRouterModels?.litellm ?? null
				modelIdKey = "litellmModelId"
				break
			case "vercel-ai-gateway":
				models = routerModels.data?.["vercel-ai-gateway"] ?? null
				modelIdKey = "vercelAiGatewayModelId"
				break
			case "poe":
				// Same as litellm: poe uses the backend broadcast cache.
				models = stateRouterModels?.poe ?? null
				modelIdKey = "apiModelId"
				break
			case "openai":
				// OpenAI Compatible: the list is fetched from the baseUrl via
				// `requestOpenAiModels` and delivered through `openAiModels`.
				models =
					Object.keys(openAiModels).length > 0
						? Object.fromEntries(openAiModels.map((item) => [item, openAiModelInfoSaneDefaults]))
						: null
				modelIdKey = "openAiModelId"
				break
			case "ollama":
				models = Object.keys(ollamaModels).length > 0 ? ollamaModels : null
				modelIdKey = "ollamaModelId"
				break
			case "lmstudio":
				models = Object.keys(lmStudioModels).length > 0 ? lmStudioModels : null
				modelIdKey = "lmStudioModelId"
				break
			case "vscode-lm":
				models = vsCodeLmModels.reduce(
					(acc, model) => {
						const modelId = `${model.vendor}/${model.family}`
						acc[modelId] = {
							maxTokens: 0,
							contextWindow: 0,
							supportsPromptCache: false,
							description: `${model.vendor} - ${model.family}`,
						}
						return acc
					},
					{} as Record<string, ModelInfo>,
				)
				modelIdKey = "vsCodeLmModelSelector"
				valueTransform = (modelId) => {
					const [vendor, family] = modelId.split("/")
					return { vendor, family }
				}
				displayTransform = (value) => {
					if (!value) return ""
					const selector = value as { vendor?: string; family?: string }
					return selector.vendor && selector.family ? `${selector.vendor}/${selector.family}` : ""
				}
				break
			default:
				// Static models providers (anthropic, bedrock, gemini, etc.).
				models = MODELS_BY_PROVIDER[activeProvider] ? getStaticModelsForProvider(activeProvider) : null
				modelIdKey = "apiModelId"
		}

		isLoading =
			(ROUTER_DEFAULT_MODEL_IDS[activeProvider] !== undefined && routerModels.isLoading) ||
			(activeProvider === "openai" &&
				!!apiConfiguration?.openAiBaseUrl &&
				!!apiConfiguration?.openAiApiKey &&
				openAiModels.length === 0)

		return {
			provider: activeProvider,
			models,
			modelIdKey,
			defaultModelId,
			isLoading,
			valueTransform,
			displayTransform,
		}
	}, [
		activeProvider,
		apiConfiguration,
		routerModels,
		stateRouterModels,
		openAiModels,
		ollamaModels,
		lmStudioModels,
		vsCodeLmModels,
	])

	return result
}
