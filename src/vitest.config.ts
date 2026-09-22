import { defineConfig } from "vitest/config"
import path from "path"
import { resolveVerbosity } from "./utils/vitest-verbosity"

const { silent, reporters, onConsoleLog } = resolveVerbosity()

export default defineConfig({
	test: {
		globals: true,
		setupFiles: ["./vitest.setup.ts"],
		watch: false,
		reporters,
		silent,
		testTimeout: 20_000,
		hookTimeout: 20_000,
		// Disable vitest's console interception to avoid the
		// "EnvironmentTeardownError: [vitest-worker]: Closing rpc while
		// \"onUserConsoleLog\" was pending" race on worker teardown. Async
		// console output in flight during teardown triggered a pending RPC
		// that randomly failed CI on both ubuntu and windows. Keeping the
		// native console writes straight to the process streams eliminates it.
		disableConsoleIntercept: true,
		onConsoleLog,
		pool: "forks",
	},
	resolve: {
		alias: {
			vscode: path.resolve(__dirname, "./__mocks__/vscode.js"),
		},
	},
})
