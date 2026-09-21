import { publisher, name, version } from "../package.json"

// These ENV variables can be defined by ESBuild when building the extension
// in order to override the values in package.json. This allows us to build
// different extension variants with the same package.json file.
// The build process still needs to emit a modified package.json for consumption
// by VSCode, but that build artifact is not used during the transpile step of
// the build, so we still need this override mechanism.
// Configuration/command/view ID prefix. Kept as "roo-cline" for backwards
// compatibility so users don't lose their settings when migrating from the
// original Roo Code extension. Can be overridden via PKG_CONFIG_PREFIX env
// var for build variants (e.g. nightly) that need separate settings.
const CONFIG_PREFIX = process.env.PKG_CONFIG_PREFIX || "roo-cline"

export const Package = {
	publisher,
	name: process.env.PKG_NAME || name,
	version: process.env.PKG_VERSION || version,
	outputChannel: process.env.PKG_OUTPUT_CHANNEL || "Roo-Code",
	sha: process.env.PKG_SHA,
	configPrefix: CONFIG_PREFIX,
} as const
