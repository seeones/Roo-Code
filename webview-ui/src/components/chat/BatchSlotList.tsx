import React from "react"
import type { BatchSlotStatus } from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { cn } from "@src/lib/utils"

/**
 * Rate limit countdown displayed next to a rate-limited batch slot.
 */
const RateLimitCountdown: React.FC<{ resetTime: number }> = ({ resetTime }) => {
	const [remaining, setRemaining] = React.useState(Math.max(0, resetTime - Date.now()))

	React.useEffect(() => {
		setRemaining(Math.max(0, resetTime - Date.now()))
		const timer = setInterval(() => {
			const secs = Math.max(0, Math.ceil((resetTime - Date.now()) / 1000))
			setRemaining(secs * 1000)
			if (secs <= 0) {
				clearInterval(timer)
			}
		}, 1000)
		return () => clearInterval(timer)
	}, [resetTime])

	const seconds = Math.ceil(remaining / 1000)
	if (seconds <= 0) return null

	return <span className="ml-1">({seconds}s)</span>
}

/**
 * Renders the fixed set of batch processing slots during indexing.
 *
 * Every slot (including idle ones) is always rendered so the popover layout
 * stays stable — idle slots appear as dimmed rows instead of disappearing,
 * which previously caused the popover height to jump as slots changed state.
 */
export const BatchSlotList: React.FC<{ slots: BatchSlotStatus[] }> = ({ slots }) => {
	const { t } = useAppTranslation()

	return (
		<div className="mt-2 space-y-1">
			{slots.map((slot) => {
				const isIdle = slot.stage === "idle"
				const isRateLimited = slot.stage === "rate_limited"
				const stageLabel = t(`settings:codeIndex.batchStage.${slot.stage}`)
				const stageIcon = isIdle
					? "codicon-circle-outline"
					: slot.stage === "embedding"
						? "codicon-globe"
						: slot.stage === "upserting"
							? "codicon-database"
							: slot.stage === "rate_limited"
								? "codicon-warning"
								: "codicon-clock"

				return (
					<div
						key={slot.slotId}
						className={cn(
							"text-xs flex items-center gap-1 px-2 py-1 rounded",
							isRateLimited
								? "bg-yellow-500/10 text-yellow-500"
								: isIdle
									? "text-vscode-descriptionForeground/50"
									: "text-vscode-descriptionForeground",
						)}>
						<span className={cn("codicon", stageIcon)} />
						<span className="font-medium">
							{t("settings:codeIndex.batchSlotLabel", { id: slot.slotId })}
						</span>
						<span>:</span>
						<span>{stageLabel}</span>
						{!isIdle && (
							<span className="text-vscode-descriptionForeground/70">
								({slot.blockCount} {t("settings:codeIndex.blocksUnit")})
							</span>
						)}
						{isRateLimited && slot.rateLimitResetTime && (
							<RateLimitCountdown resetTime={slot.rateLimitResetTime} />
						)}
						{slot.retryCount > 1 && !isRateLimited && (
							<span className="text-vscode-descriptionForeground/70">
								{t("settings:codeIndex.retryCount", {
									count: slot.retryCount,
								})}
							</span>
						)}
					</div>
				)
			})}
		</div>
	)
}
