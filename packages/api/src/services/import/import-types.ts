/** Internal types for the import engine (not shared with frontend) */

import type { ImportParseResult } from '@agentwiki/shared'
import type { Env } from '../../env'

/** Adapter interface — each source implements this */
export interface ImportAdapter {
  parse(env: Env, data: ArrayBuffer | null, config?: Record<string, unknown>): Promise<ImportParseResult>
}

/** Mapping built during import for link resolution */
export interface ImportMappings {
  /** sourcePath → AgentWiki folderId */
  folderMap: Map<string, string>
  /** sourcePath → AgentWiki documentId */
  documentMap: Map<string, string>
  /** sourcePath → AgentWiki document slug */
  slugMap: Map<string, string>
  /** original attachment path → R2 file URL */
  attachmentMap: Map<string, string>
}
