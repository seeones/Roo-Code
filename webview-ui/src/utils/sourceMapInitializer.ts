/**
 * Source Map Initializer
 *
 * This utility ensures source maps are properly loaded in production builds.
 * It attempts to preload source maps for all scripts on the page and
 * sets up global error handlers to enhance errors with source maps.
 *
 * This implementation is compatible with VSCode's Content Security Policy.
 */

import { enhanceErrorWithSourceMaps } from "./sourceMapUtils"
import { vscode } from "./vscode"

/**
 * Report a webview runtime error to the extension host for observability.
 *
 * The extension host logs it to the output channel. This is the foundation of
 * grey-screen diagnosis: without it, any webview crash is invisible to the
 * extension side and cannot be verified against candidate fixes.
 *
 * Safe to call from anywhere; never throws (reporting must not cause a
 * recursive failure).
 */
export function reportWebviewError(
	error: unknown,
	source: "error" | "unhandledrejection" | "errorboundary",
	componentStack?: string,
): void {
	try {
		const message = error instanceof Error ? error.message : String(error)
		const stack = error instanceof Error ? error.stack : undefined
		vscode.postMessage({
			type: "webviewError",
			webviewError: {
				message,
				stack,
				componentStack,
				source,
				url: typeof window !== "undefined" ? window.location.href : undefined,
			},
		})
	} catch {
		// Never let observability itself break the app.
	}
}

/**
 * Initialize source map support for production builds
 */
export function initializeSourceMaps(): void {
	if (process.env.NODE_ENV !== "production") {
		// Only needed in production builds
		return
	}

	console.debug("Initializing CSP-compatible source map support for production build")

	// Set up global error handler
	window.addEventListener("error", async (event) => {
		// Report the raw error to the extension host first, so a crash is never
		// lost even if source-map enhancement fails below.
		reportWebviewError(event.error ?? event.message, "error")

		if (event.error && event.error instanceof Error) {
			try {
				// Apply source maps to the error
				const enhancedError = await enhanceErrorWithSourceMaps(event.error)

				// Log the enhanced error
				console.error("Source mapped error:", enhancedError)

				// Don't prevent default handling - let the ErrorBoundary catch it
			} catch (e) {
				console.error("Error enhancing error with source maps:", e)
			}
		}
	})

	// Set up unhandled promise rejection handler
	window.addEventListener("unhandledrejection", async (event) => {
		reportWebviewError(event.reason ?? "Unhandled promise rejection", "unhandledrejection")

		if (event.reason && event.reason instanceof Error) {
			try {
				// Apply source maps to the error
				const enhancedError = await enhanceErrorWithSourceMaps(event.reason)

				// Log the enhanced error
				console.error("Source mapped rejection:", enhancedError)
			} catch (e) {
				console.error("Error enhancing rejection with source maps:", e)
			}
		}
	})

	// Preload source maps for all scripts.
	// We own the build pipeline (see webview-ui/vite.config.ts and the
	// sourcemapPlugin), which appends a sourceMappingURL comment to every
	// generated chunk. Reading that comment is the single source of truth for
	// the map's real file name, so we do NOT guess candidate names (which
	// produced spurious 404s in the webview logs).
	try {
		const scripts = document.getElementsByTagName("script")
		for (let i = 0; i < scripts.length; i++) {
			const script = scripts[i]
			if (!script.src) {
				continue
			}

			// Resolve the map URL from the inline sourceMappingURL comment.
			fetch(script.src)
				.then((response) => response.text())
				.then((content) => {
					const sourceMappingURLMatch = content.match(/\/\/[#@]\s*sourceMappingURL=([^\s]+)/)
					if (!sourceMappingURLMatch || !sourceMappingURLMatch[1]) {
						return
					}

					const sourceMappingURL = sourceMappingURLMatch[1]

					// Inline data: maps need no preload.
					if (sourceMappingURL.startsWith("data:")) {
						return
					}

					const scriptUrlObj = new URL(script.src)
					const baseUrl = scriptUrlObj.href.substring(0, scriptUrlObj.href.lastIndexOf("/") + 1)
					const fullUrl = new URL(sourceMappingURL, baseUrl).href

					// Probe first so we only preload maps that actually exist.
					return fetch(fullUrl)
						.then((mapResponse) => {
							if (!mapResponse.ok) {
								console.debug(`Source map not found (skipping preload): ${fullUrl}`)
								return
							}
							const link = document.createElement("link")
							link.rel = "preload"
							link.as = "fetch"
							link.href = fullUrl
							link.crossOrigin = "anonymous"
							document.head.appendChild(link)
						})
						.catch((e) => console.debug("Error probing source map:", e))
				})
				.catch((e) => console.debug("Error checking for inline sourceMappingURL:", e))
		}
	} catch (e) {
		console.error("Error preloading source maps:", e)
	}
}

/**
 * Expose source maps on the window object for debugging
 */
export function exposeSourceMapsForDebugging(): void {
	if (process.env.NODE_ENV !== "production") {
		return
	}

	try {
		// Add a global function to manually apply source maps to an error
		;(window as any).__applySourceMaps = async (error: Error) => {
			if (!(error instanceof Error)) {
				console.error("Not an Error object:", error)
				return error
			}
			return await enhanceErrorWithSourceMaps(error)
		}

		// Add a global function to test source map functionality
		;(window as any).__testSourceMaps = () => {
			try {
				// Intentionally cause an error
				const obj: any = undefined
				obj.nonExistentMethod()
			} catch (e) {
				if (e instanceof Error) {
					console.log("Original error:", e)
					;(window as any).__applySourceMaps(e).then((enhanced: Error) => {
						console.log("Enhanced error:", enhanced)

						// Log the source mapped stack if available
						if ("sourceMappedStack" in enhanced) {
							console.log("Source mapped stack:", enhanced.sourceMappedStack)
						}

						// Log the source mapped component stack if available
						if ("sourceMappedComponentStack" in enhanced) {
							console.log("Source mapped component stack:", enhanced.sourceMappedComponentStack)
						}
					})
				}
			}
		}

		// Add a global function to check if source maps are available for a script
		;(window as any).__checkSourceMap = async (scriptUrl: string) => {
			try {
				const response = await fetch(`${scriptUrl}.map`)
				if (response.ok) {
					const sourceMap = await response.json()
					const originalFileName =
						sourceMap.sources && sourceMap.sources.length > 0 ? sourceMap.sources[0] : "unknown"
					console.log(`Source map found for ${scriptUrl}. Original file: ${originalFileName}`)
					return true
				} else {
					console.log(`No source map found for ${scriptUrl}`)
					return false
				}
			} catch (e) {
				console.error(`Error checking source map for ${scriptUrl}:`, e)
				return false
			}
		}

		console.debug("Source map debugging utilities exposed on window object")
	} catch (e) {
		console.error("Error exposing source maps for debugging:", e)
	}
}
