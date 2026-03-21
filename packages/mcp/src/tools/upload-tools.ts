/** MCP tools for file upload and listing (2 tools) */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { uploadFile, listUploads } from '../../../api/src/services/upload-service'
import { checkPermission } from '../auth/api-key-auth'
import { logMcpAudit } from '../utils/audit-logger'
import { toolResult, toolError, safeToolCall } from '../utils/mcp-error-handler'
import type { Env, McpAuthContext } from '../env'

const MAX_BASE64_SIZE = 2_097_152 // 2MB encoded ≈ 1.5MB actual

export function registerUploadTools(
  server: McpServer,
  env: Env,
  auth: McpAuthContext,
  ctx: ExecutionContext,
) {
  server.registerTool('upload_file', {
    description: 'Upload a file to the wiki (base64 encoded, max 2MB encoded). Optionally link to a document.',
    inputSchema: {
      filename: z.string().describe('File name with extension (e.g. image.png)'),
      contentBase64: z.string().max(MAX_BASE64_SIZE).describe('Base64-encoded file content (max 2MB encoded)'),
      contentType: z.string().describe('MIME type (e.g. image/png, application/pdf)'),
      documentId: z.string().optional().describe('Link upload to a document'),
    },
  }, async (args) => {
    if (!checkPermission(auth.scopes, 'doc:create')) return toolError('Permission denied: doc:create required')
    return safeToolCall(async () => {
      // Decode base64 to ArrayBuffer
      const binaryStr = atob(args.contentBase64)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i)
      }
      const result = await uploadFile(
        env as never, auth.tenantId, auth.userId,
        args.filename, args.contentType, bytes.buffer, args.documentId,
      )
      logMcpAudit(ctx, env, auth, 'upload.create', 'upload', result.id)
      return result
    })
  })

  server.registerTool('upload_list', {
    description: 'List uploaded files, optionally filtered by document',
    inputSchema: {
      documentId: z.string().optional().describe('Filter uploads by document ID'),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    if (!checkPermission(auth.scopes, 'doc:read')) return toolError('Permission denied: doc:read required')
    return safeToolCall(() => listUploads(env as never, auth.tenantId, args.documentId))
  })
}
