/**
 * Tests for the batch slot rendering behavior in CodeIndexPopover.
 *
 * Feature: During indexing, all batch slots should be rendered (fixed layout)
 * so the popover height stays stable. Idle slots should display as dimmed
 * "Idle" rows instead of being hidden (which caused the popover to jump
 * up and down as slots changed state).
 *
 * The rendering logic lives in BatchSlotList, which is used by
 * CodeIndexPopover.
 */
import { render, screen, cleanup } from "@testing-library/react"

import { BatchSlotList } from "../BatchSlotList"

// Ensure DOM is cleared between tests. In single-threaded vitest runs the
// automatic RTL cleanup is not guaranteed, so we clear explicitly to prevent
// getByText from matching elements rendered by a previous test.
afterEach(() => {
	cleanup()
})

vi.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string, params?: any) => {
			const translations: Record<string, string> = {
				"settings:codeIndex.batchSlotLabel": `Slot ${params?.id}`,
				"settings:codeIndex.blocksUnit": "blocks",
				"settings:codeIndex.batchStage.idle": "Idle",
				"settings:codeIndex.batchStage.embedding": "Embedding",
				"settings:codeIndex.batchStage.upserting": "Upserting",
				"settings:codeIndex.batchStage.rate_limited": "Rate Limited",
				"settings:codeIndex.retryCount": `retry ${params?.count}`,
			}
			return translations[key] || key
		},
	}),
}))

describe("BatchSlotList - Fixed Slot Rendering", () => {
	const makeSlots = (stages: Array<"idle" | "embedding" | "upserting" | "rate_limited">) =>
		stages.map((stage, i) => ({
			slotId: i + 1,
			stage,
			blockCount: stage === "idle" ? 0 : 10,
			retryCount: stage === "idle" ? 0 : 1,
		}))

	it("renders all batch slots including idle ones (fixed layout)", () => {
		render(<BatchSlotList slots={makeSlots(["idle", "embedding", "idle", "upserting"])} />)

		// All 4 slots should be present in the document
		expect(screen.getByText("Slot 1")).toBeInTheDocument()
		expect(screen.getByText("Slot 2")).toBeInTheDocument()
		expect(screen.getByText("Slot 3")).toBeInTheDocument()
		expect(screen.getByText("Slot 4")).toBeInTheDocument()

		// Idle slots show the "Idle" stage label
		expect(screen.getAllByText("Idle")).toHaveLength(2)

		// Active slots show their stage labels
		expect(screen.getByText("Embedding")).toBeInTheDocument()
		expect(screen.getByText("Upserting")).toBeInTheDocument()
	})

	it("does not show block count for idle slots", () => {
		render(<BatchSlotList slots={makeSlots(["idle", "embedding"])} />)

		// Only the embedding slot should show block count "(10 blocks)"
		expect(screen.getAllByText(/\(10 blocks\)/)).toHaveLength(1)
	})

	it("renders all slots as idle when no batch is active", () => {
		render(<BatchSlotList slots={makeSlots(["idle", "idle", "idle"])} />)

		expect(screen.getAllByText("Idle")).toHaveLength(3)
		expect(screen.getByText("Slot 1")).toBeInTheDocument()
		expect(screen.getByText("Slot 2")).toBeInTheDocument()
		expect(screen.getByText("Slot 3")).toBeInTheDocument()
	})

	it("renders rate limited slot with warning label and countdown", () => {
		render(
			<BatchSlotList
				slots={[
					{
						slotId: 1,
						stage: "rate_limited",
						blockCount: 10,
						retryCount: 2,
						rateLimitResetTime: Date.now() + 5000,
					},
				]}
			/>,
		)

		expect(screen.getByText("Slot 1")).toBeInTheDocument()
		expect(screen.getByText("Rate Limited")).toBeInTheDocument()
		// Rate-limited slots show a countdown (e.g. "(5s)") instead of retry count
		expect(screen.getByText(/\(\d+s\)/)).toBeInTheDocument()
	})

	it("renders empty list when no slots provided", () => {
		const { container } = render(<BatchSlotList slots={[]} />)
		expect(container.querySelectorAll("div")).toHaveLength(1) // just the container
	})
})
