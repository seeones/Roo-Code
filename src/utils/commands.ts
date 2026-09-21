import type { CommandId, CodeActionId, TerminalActionId } from "@roo-code/types"

import { Package } from "../shared/package"

export const getCommand = (id: CommandId) => `${Package.configPrefix}.${id}`

export const getCodeActionCommand = (id: CodeActionId) => `${Package.configPrefix}.${id}`

export const getTerminalCommand = (id: TerminalActionId) => `${Package.configPrefix}.${id}`
