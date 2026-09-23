import { render, fireEvent, waitFor } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { UISettings } from "../UISettings"

vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeCheckbox: ({ children, onChange, checked, "data-testid": dataTestId }: any) => (
		<label>
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange({ target: { checked: e.target.checked } })}
				data-testid={dataTestId}
			/>
			{children}
		</label>
	),
	VSCodeDropdown: ({ value, onChange, children, "data-testid": dataTestId }: any) => (
		<select
			value={value}
			onChange={(e) => onChange({ target: { value: e.target.value } })}
			data-testid={dataTestId}>
			{children}
		</select>
	),
	VSCodeOption: ({ value, children }: any) => <option value={value}>{children}</option>,
}))

describe("UISettings", () => {
	const defaultProps = {
		reasoningBlockCollapsed: false,
		enterBehavior: "send" as const,
		chatInputEffect: "marquee" as const,
		setCachedStateField: vi.fn(),
	}

	it("renders the collapse thinking checkbox", () => {
		const { getByTestId } = render(<UISettings {...defaultProps} />)
		const checkbox = getByTestId("collapse-thinking-checkbox")
		expect(checkbox).toBeTruthy()
	})

	it("displays the correct initial state", () => {
		const { getByTestId } = render(<UISettings {...defaultProps} reasoningBlockCollapsed={true} />)
		const checkbox = getByTestId("collapse-thinking-checkbox") as HTMLInputElement
		expect(checkbox.checked).toBe(true)
	})

	it("calls setCachedStateField when checkbox is toggled", async () => {
		const setCachedStateField = vi.fn()
		const { getByTestId } = render(<UISettings {...defaultProps} setCachedStateField={setCachedStateField} />)

		const checkbox = getByTestId("collapse-thinking-checkbox")
		fireEvent.click(checkbox)

		await waitFor(() => {
			expect(setCachedStateField).toHaveBeenCalledWith("reasoningBlockCollapsed", true)
		})
	})

	it("updates checkbox state when prop changes", () => {
		const { getByTestId, rerender } = render(<UISettings {...defaultProps} reasoningBlockCollapsed={false} />)
		const checkbox = getByTestId("collapse-thinking-checkbox") as HTMLInputElement
		expect(checkbox.checked).toBe(false)

		rerender(<UISettings {...defaultProps} reasoningBlockCollapsed={true} />)
		expect(checkbox.checked).toBe(true)
	})

	it("renders the chat input effect dropdown", () => {
		const { getByTestId } = render(<UISettings {...defaultProps} />)
		const dropdown = getByTestId("chat-input-effect-dropdown") as HTMLSelectElement
		expect(dropdown).toBeTruthy()
		expect(dropdown.value).toBe("marquee")
	})

	it("calls setCachedStateField when chat input effect is changed", async () => {
		const setCachedStateField = vi.fn()
		const { getByTestId } = render(<UISettings {...defaultProps} setCachedStateField={setCachedStateField} />)

		const dropdown = getByTestId("chat-input-effect-dropdown")
		fireEvent.change(dropdown, { target: { value: "breathing" } })

		await waitFor(() => {
			expect(setCachedStateField).toHaveBeenCalledWith("chatInputEffect", "breathing")
		})
	})
})
