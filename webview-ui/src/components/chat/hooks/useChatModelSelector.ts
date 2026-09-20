import { useCallback, useMemo, useState } from "react"
import { useEvent } from "react-use"

import {
	type ProviderName,
	type ProviderSettings,
	type ModelInfo,
	type ModelRecord,
	type ExtensionMessage,
	type LanguageModelChatSelector,
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
import { useLmStudioModels } from "@/components/ui/hooks/useLmStudioModels"
import { useOllamaModels } from "@/components/ui/hooks/useOllamaModels"
import { getStaticModelsForProvider } from "@/components/settings/utils/providerModelConfig"
import { MODELS_BY_PROVIDER } from "@/components/settings/constants"
import { useExtensionState } from "@/context/ExtensionStateContext"

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
 */
export const useChatModelSelector = (): ChatModelSelectorData => {
	const { apiConfiguration } = useExtensionState()

	const provider = (apiConfiguration?.apiProvider || "openrouter") as ProviderName
	const activeProvider = isRetiredProvider(provider) ? undefined : provider

	// Dynamic (router-based) providers: openrouter, requesty, unbound, litellm,
	// vercel-ai-gateway, poe.
	const routerModels = useRouterModels({
		provider: activeProvider,
		enabled: !!activeProvider && ROUTER_DEFAULT_MODEL_IDS[activeProvider] !== undefined,
	})

	// Local inference providers.
	const lmStudioModelId = activeProvider === "lmstudio" ? apiConfiguration?.lmStudioModelId : undefined
	const ollamaModelId = activeProvider === "ollama" ? apiConfiguration?.ollamaModelId : undefined
	const lmStudioModels = useLmStudioModels(lmStudioModelId)
	const ollamaModels = useOllamaModels(ollamaModelId)

	// VSCode LM models are delivered via a message event.
	const [vsCodeLmModels, setVsCodeLmModels] = useState<LanguageModelChatSelector[]>([])
	const onMessage = useCallback((event: MessageEvent) => {
		const message: ExtensionMessage = event.data
		if (message.type === "vsCodeLmModels") {
			setVsCodeLmModels(message.vsCodeLmModels ?? [])
		}
	}, [])
	useEvent("message", onMessage)

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
				models = routerModels.data?.litellm ?? null
				modelIdKey = "litellmModelId"
				break
			case "vercel-ai-gateway":
				models = routerModels.data?.["vercel-ai-gateway"] ?? null
				modelIdKey = "vercelAiGatewayModelId"
				break
			case "poe":
				models = routerModels.data?.poe ?? null
				modelIdKey = "apiModelId"
				break
			case "ollama":
				models = (ollamaModels.data as ModelRecord | undefined) ?? null
				modelIdKey = "ollamaModelId"
				break
			case "lmstudio":
				models = (lmStudioModels.data as ModelRecord | undefined) ?? null
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
			case "openai":
				// OpenAI Compatible: models are user-provided text, so no predefined list.
				models = null
				modelIdKey = "openAiModelId"
				break
			default:
				// Static models providers (anthropic, bedrock, gemini, etc.).
				if (MODELS_BY_PROVIDER[activeProvider]) {
					models = getStaticModelsForProvider(activeProvider)
					modelIdKey = "apiModelId"
				} else {
					models = null
					modelIdKey = "apiModelId"
				}
		}

		isLoading =
			(ROUTER_DEFAULT_MODEL_IDS[activeProvider] !== undefined && routerModels.isLoading) ||
			(activeProvider === "ollama" && ollamaModels.isLoading) ||
			(activeProvider === "lmstudio" && lmStudioModels.isLoading)

		return {
			provider: activeProvider,
			models,
			modelIdKey,
			defaultModelId,
			isLoading,
			valueTransform,
			displayTransform,
		}
	}, [activeProvider, apiConfiguration, routerModels, ollamaModels, lmStudioModels, vsCodeLmModels])

	return result
}
