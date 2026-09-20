import * as vscode from "vscode"

export type IndexingState = "Standby" | "Indexing" | "Indexed" | "Error" | "Stopping"
export type BatchStage = "idle" | "embedding" | "rate_limited" | "upserting"

export interface BatchSlotStatus {
	slotId: number
	stage: BatchStage
	blockCount: number
	retryCount: number
	rateLimitResetTime?: number
}

export class CodeIndexStateManager {
	private _systemStatus: IndexingState = "Standby"
	private _statusMessage: string = ""
	private _processedItems: number = 0
	private _totalItems: number = 0
	private _currentItemUnit: string = "blocks"
	private _currentFile: string = ""
	private _pendingBatches: number = 0
	private _activeBatches: number = 0
	private _queuedBatches: number = 0
	private _batchSlots: BatchSlotStatus[] = []
	private _batchConcurrency: number = 0
	private _isRateLimited: boolean = false
	private _rateLimitResetTime: number = 0
	private _rateLimitRetryCount: number = 0
	private _progressEmitter = new vscode.EventEmitter<ReturnType<typeof this.getCurrentStatus>>()

	// --- Public API ---

	public readonly onProgressUpdate = this._progressEmitter.event

	public get state(): IndexingState {
		return this._systemStatus
	}

	public getCurrentStatus() {
		return {
			systemStatus: this._systemStatus,
			message: this._statusMessage,
			processedItems: this._processedItems,
			totalItems: this._totalItems,
			currentItemUnit: this._currentItemUnit,
			currentFile: this._currentFile,
			pendingBatches: this._pendingBatches,
			activeBatches: this._activeBatches,
			queuedBatches: this._queuedBatches,
			batchSlots: this._batchSlots,
			batchConcurrency: this._batchConcurrency,
			isRateLimited: this._isRateLimited,
			rateLimitResetTime: this._rateLimitResetTime,
			rateLimitRetryCount: this._rateLimitRetryCount,
		}
	}

	// --- State Management ---

	public setSystemState(newState: IndexingState, message?: string): void {
		const stateChanged =
			newState !== this._systemStatus || (message !== undefined && message !== this._statusMessage)

		if (stateChanged) {
			this._systemStatus = newState
			if (message !== undefined) {
				this._statusMessage = message
			}

			// Reset progress counters if moving to a non-indexing state or starting fresh
			if (newState !== "Indexing") {
				this._processedItems = 0
				this._totalItems = 0
				this._currentItemUnit = "blocks" // Reset to default unit
				this._currentFile = ""
				this._pendingBatches = 0
				this._activeBatches = 0
				this._queuedBatches = 0
				this._batchSlots = []
				this._batchConcurrency = 0
				this._isRateLimited = false
				this._rateLimitResetTime = 0
				this._rateLimitRetryCount = 0
				// Optionally clear the message or set a default for non-indexing states
				if (newState === "Standby" && message === undefined) this._statusMessage = "Ready."
				if (newState === "Indexed" && message === undefined) this._statusMessage = "Index up-to-date."
				if (newState === "Error" && message === undefined) this._statusMessage = "An error occurred."
			}

			this._progressEmitter.fire(this.getCurrentStatus())
		}
	}

	public reportBlockIndexingProgress(processedItems: number, totalItems: number): void {
		const progressChanged = processedItems !== this._processedItems || totalItems !== this._totalItems

		// Don't override Stopping state with progress updates
		if (this._systemStatus === "Stopping") return
		// Update if progress changes OR if the system wasn't already in 'Indexing' state
		if (progressChanged || this._systemStatus !== "Indexing") {
			this._processedItems = processedItems
			this._totalItems = totalItems
			this._currentItemUnit = "blocks"

			const message = `Indexed ${this._processedItems} / ${this._totalItems} ${this._currentItemUnit} found`
			const oldStatus = this._systemStatus
			const oldMessage = this._statusMessage

			this._systemStatus = "Indexing" // Ensure state is Indexing
			this._statusMessage = message

			// Only fire update if status, message or progress actually changed
			if (oldStatus !== this._systemStatus || oldMessage !== this._statusMessage || progressChanged) {
				this._progressEmitter.fire(this.getCurrentStatus())
			}
		}
	}

	public reportFileQueueProgress(processedFiles: number, totalFiles: number, currentFileBasename?: string): void {
		const progressChanged = processedFiles !== this._processedItems || totalFiles !== this._totalItems

		// Don't override Stopping state with progress updates
		if (this._systemStatus === "Stopping") return
		if (progressChanged || this._systemStatus !== "Indexing") {
			this._processedItems = processedFiles
			this._totalItems = totalFiles
			this._currentItemUnit = "files"
			this._systemStatus = "Indexing"

			let message: string
			if (totalFiles > 0 && processedFiles < totalFiles) {
				message = `Processing ${processedFiles} / ${totalFiles} ${this._currentItemUnit}. Current: ${
					currentFileBasename || "..."
				}`
			} else if (totalFiles > 0 && processedFiles === totalFiles) {
				message = `Finished processing ${totalFiles} ${this._currentItemUnit} from queue.`
			} else {
				message = `File queue processed.`
			}

			const oldStatus = this._systemStatus
			const oldMessage = this._statusMessage

			this._statusMessage = message

			if (oldStatus !== this._systemStatus || oldMessage !== this._statusMessage || progressChanged) {
				this._progressEmitter.fire(this.getCurrentStatus())
			}
		}
	}

	public reportCurrentFile(filePath: string): void {
		if (this._systemStatus === "Stopping") return
		if (filePath === this._currentFile) return

		this._currentFile = filePath
		this._systemStatus = "Indexing"
		this._progressEmitter.fire(this.getCurrentStatus())
	}

	public reportPendingBatches(count: number): void {
		if (this._systemStatus === "Stopping") return
		if (count === this._pendingBatches) return

		this._pendingBatches = count
		this._systemStatus = "Indexing"
		this._progressEmitter.fire(this.getCurrentStatus())
	}

	public reportRateLimit(resetTime: number, retryCount: number): void {
		if (this._systemStatus === "Stopping") return

		const changed =
			this._isRateLimited !== true ||
			this._rateLimitResetTime !== resetTime ||
			this._rateLimitRetryCount !== retryCount

		if (!changed) return

		this._isRateLimited = true
		this._rateLimitResetTime = resetTime
		this._rateLimitRetryCount = retryCount
		this._systemStatus = "Indexing"
		this._progressEmitter.fire(this.getCurrentStatus())
	}

	public clearRateLimit(): void {
		if (!this._isRateLimited) return

		this._isRateLimited = false
		this._rateLimitResetTime = 0
		this._rateLimitRetryCount = 0
		this._progressEmitter.fire(this.getCurrentStatus())
	}

	// --- Batch Slot Management ---

	public setBatchConcurrency(concurrency: number): void {
		this._batchConcurrency = concurrency
		this._batchSlots = Array.from({ length: concurrency }, (_, i) => ({
			slotId: i + 1,
			stage: "idle" as BatchStage,
			blockCount: 0,
			retryCount: 0,
		}))
	}

	public updateBatchSlot(slotId: number, updates: Partial<BatchSlotStatus>): void {
		if (this._systemStatus === "Stopping") return

		const slot = this._batchSlots.find((s) => s.slotId === slotId)
		if (!slot) return

		let changed = false
		for (const [key, value] of Object.entries(updates)) {
			if ((slot as any)[key] !== value) {
				;(slot as any)[key] = value
				changed = true
			}
		}

		if (changed) {
			this._recalculateBatchCounts()
			this._systemStatus = "Indexing"
			this._progressEmitter.fire(this.getCurrentStatus())
		}
	}

	public resetBatchSlot(slotId: number): void {
		if (this._systemStatus === "Stopping") return

		const slot = this._batchSlots.find((s) => s.slotId === slotId)
		if (!slot) return

		slot.stage = "idle"
		slot.blockCount = 0
		slot.retryCount = 0
		slot.rateLimitResetTime = undefined

		this._recalculateBatchCounts()
		this._progressEmitter.fire(this.getCurrentStatus())
	}

	private _recalculateBatchCounts(): void {
		const activeStages: BatchStage[] = ["embedding", "rate_limited", "upserting"]
		this._activeBatches = this._batchSlots.filter((s) => activeStages.includes(s.stage)).length
	}

	public reportQueuedBatches(count: number): void {
		if (this._systemStatus === "Stopping") return
		if (count === this._queuedBatches) return

		this._queuedBatches = count
		this._systemStatus = "Indexing"
		this._progressEmitter.fire(this.getCurrentStatus())
	}

	public dispose(): void {
		this._progressEmitter.dispose()
	}
}
