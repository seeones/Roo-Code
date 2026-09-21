import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs/promises"
import { fileExistsAtPath } from "./fs"
import { Package } from "../shared/package"

const MIGRATION_STATE_KEY = "legacyExtensionMigrationCompleted"
const LEGACY_EXTENSION_ID = "RooVeterinaryInc.roo-cline"

/**
 * Migrates data from the legacy Roo Code extension (RooVeterinaryInc.roo-cline)
 * to the current extension. This handles the fork/rebrand scenario where users
 * have existing data in the old extension's storage directory.
 *
 * Migrated data (from globalStorage directory):
 * - Task history and conversation files (tasks/)
 * - Settings files (settings/)
 * - Model cache files (cache/)
 * - Code index cache files (roo-index-cache-*.json)
 *
 * Not migrated (stored in VSCode's internal globalState/secrets, not accessible cross-extension):
 * - API keys and provider configuration (stored in secrets)
 * - UI state preferences (stored in globalState)
 *
 * Users will need to reconfigure API keys, or use the export/import feature
 * from the old extension to manually transfer provider configuration.
 */
export async function migrateFromLegacyExtension(
	context: vscode.ExtensionContext,
	outputChannel: vscode.OutputChannel,
): Promise<void> {
	try {
		// Check if migration has already been completed
		if (context.globalState.get(MIGRATION_STATE_KEY)) {
			outputChannel.appendLine("[Legacy Migration] Migration already completed, skipping")
			return
		}

		// Check if we already have any data (don't migrate if user has already set things up)
		const hasExistingData = await checkForExistingData(context.globalStorageUri.fsPath)
		if (hasExistingData) {
			outputChannel.appendLine("[Legacy Migration] Existing data found, skipping migration")
			await context.globalState.update(MIGRATION_STATE_KEY, true)
			return
		}

		// Find the legacy extension's global storage path
		const legacyStoragePath = getLegacyStoragePath(context.globalStorageUri.fsPath)
		if (!legacyStoragePath || !(await fileExistsAtPath(legacyStoragePath))) {
			outputChannel.appendLine("[Legacy Migration] No legacy extension storage found, skipping")
			await context.globalState.update(MIGRATION_STATE_KEY, true)
			return
		}

		outputChannel.appendLine(`[Legacy Migration] Found legacy storage at: ${legacyStoragePath}`)

		// Copy data from legacy storage to new storage
		const migratedItems: string[] = []

		// Copy tasks directory (conversation history, task data)
		const tasksMigrated = await copyDirectoryIfExists(
			path.join(legacyStoragePath, "tasks"),
			path.join(context.globalStorageUri.fsPath, "tasks"),
		)
		if (tasksMigrated) {
			migratedItems.push("task history")
		}

		// Copy settings directory
		const settingsMigrated = await copyDirectoryIfExists(
			path.join(legacyStoragePath, "settings"),
			path.join(context.globalStorageUri.fsPath, "settings"),
		)
		if (settingsMigrated) {
			migratedItems.push("settings files")
		}

		// Copy cache directory
		const cacheMigrated = await copyDirectoryIfExists(
			path.join(legacyStoragePath, "cache"),
			path.join(context.globalStorageUri.fsPath, "cache"),
		)
		if (cacheMigrated) {
			migratedItems.push("model cache")
		}

		// Copy code index cache files (roo-index-cache-*.json)
		const codeIndexMigrated = await copyCodeIndexCache(
			legacyStoragePath,
			context.globalStorageUri.fsPath,
		)
		if (codeIndexMigrated) {
			migratedItems.push("code index cache")
		}

		// Mark migration as complete
		await context.globalState.update(MIGRATION_STATE_KEY, true)

		if (migratedItems.length > 0) {
			const message = `Successfully migrated from legacy Roo Code extension: ${migratedItems.join(", ")}`
			outputChannel.appendLine(`[Legacy Migration] ${message}`)

			// Check if legacy extension is installed for better UX messaging
			const legacyExtension = vscode.extensions.getExtension(LEGACY_EXTENSION_ID)
			const hasLegacyExtension = !!legacyExtension

			const infoMessage = hasLegacyExtension
				? `Roo Code Continue: Migrated ${migratedItems.join(", ")} from your previous Roo Code installation. Note: API keys and provider profiles need to be reconfigured (VSCode security restriction). You can use the Export Settings feature in the old Roo Code extension, then import them here.`
				: `Roo Code Continue: Migrated ${migratedItems.join(", ")} from your previous Roo Code installation. Note: API keys and provider profiles need to be reconfigured (VSCode security restriction).`

			vscode.window.showInformationMessage(infoMessage)
		} else {
			outputChannel.appendLine("[Legacy Migration] No migratable data found in legacy storage")
		}
	} catch (error) {
		outputChannel.appendLine(
			`[Legacy Migration] Error during migration: ${error instanceof Error ? error.message : String(error)}`,
		)
		// Don't block extension activation due to migration failure
	}
}

/**
 * Check if the current extension already has any user data.
 * If yes, we skip migration to avoid overwriting existing data.
 */
async function checkForExistingData(storagePath: string): Promise<boolean> {
	const checks = [
		path.join(storagePath, "tasks"),
		path.join(storagePath, "settings"),
	]

	for (const checkPath of checks) {
		if (await fileExistsAtPath(checkPath)) {
			try {
				const entries = await fs.readdir(checkPath)
				if (entries.length > 0) {
					return true
				}
			} catch {
				// If we can't read it, assume it's empty
			}
		}
	}

	return false
}

/**
 * Derive the legacy extension's global storage path from the current extension's path.
 * Replaces the current extension ID with the legacy one in the path.
 */
function getLegacyStoragePath(currentStoragePath: string): string | null {
	const currentExtensionId = `${Package.publisher}.${Package.name}`
	const legacyExtensionId = LEGACY_EXTENSION_ID

	if (currentStoragePath.includes(currentExtensionId)) {
		return currentStoragePath.replace(currentExtensionId, legacyExtensionId)
	}

	// If for some reason the path doesn't contain our ID, try to construct it
	// Look for the globalStorage directory and append the legacy ID
	const globalStorageMatch = currentStoragePath.match(/^(.*[\\/]globalStorage[\\/]).+$/)
	if (globalStorageMatch) {
		return path.join(globalStorageMatch[1], legacyExtensionId)
	}

	return null
}

/**
 * Copy a directory from source to destination if the source exists and has content.
 * Returns true if data was copied.
 */
async function copyDirectoryIfExists(srcDir: string, dstDir: string): Promise<boolean> {
	if (!(await fileExistsAtPath(srcDir))) {
		return false
	}

	try {
		// Check if source directory has any content
		const entries = await fs.readdir(srcDir)
		if (entries.length === 0) {
			return false
		}

		// Create destination directory
		await fs.mkdir(dstDir, { recursive: true })

		// Copy all contents
		await copyDirectoryRecursive(srcDir, dstDir)

		return true
	} catch (error) {
		console.warn("[Legacy Migration] Failed to copy directory:", error)
		return false
	}
}

/**
 * Recursively copy a directory
 */
async function copyDirectoryRecursive(srcDir: string, dstDir: string): Promise<void> {
	const entries = await fs.readdir(srcDir, { withFileTypes: true })

	for (const entry of entries) {
		const srcPath = path.join(srcDir, entry.name)
		const dstPath = path.join(dstDir, entry.name)

		if (entry.isDirectory()) {
			await fs.mkdir(dstPath, { recursive: true })
			await copyDirectoryRecursive(srcPath, dstPath)
		} else {
			await fs.copyFile(srcPath, dstPath)
		}
	}
}

/**
 * Copy code index cache files (roo-index-cache-*.json)
 */
async function copyCodeIndexCache(srcDir: string, dstDir: string): Promise<boolean> {
	try {
		const entries = await fs.readdir(srcDir)
		const cacheFiles = entries.filter(
			(f) => f.startsWith("roo-index-cache-") && f.endsWith(".json"),
		)

		if (cacheFiles.length === 0) {
			return false
		}

		await fs.mkdir(dstDir, { recursive: true })

		for (const file of cacheFiles) {
			await fs.copyFile(path.join(srcDir, file), path.join(dstDir, file))
		}

		return true
	} catch {
		return false
	}
}
