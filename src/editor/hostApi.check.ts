// Compile-time conformance check: fails `npm run typecheck` if `Editor` stops
// satisfying the declared host API. Not shipped; never executed.
import Editor from './Editor.js'
import type { EditorHostApi } from './hostApi.js'

export const check = (e: InstanceType<typeof Editor>): EditorHostApi => e
