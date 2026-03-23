/** MCP tools for document CRUD, versioning, and link management (8 tools) */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  createDocument,
  getDocument,
  getDocumentBySlug,
  listDocuments,
  updateDocument,
  deleteDocument,
  getVersionHistory,
  createVersionCheckpoint,
  getDocumentLinks,
} from '@agentwiki/api/services/document-service'
import { checkPermission } from '../auth/api-key-auth'
import { logMcpAudit } from '../utils/audit-logger'
import { toolResult, toolError, toolText, safeToolCall } from '../utils/mcp-error-handler'
import type { Env, McpAuthContext } from '../env'

export function registerDocumentTools(
  server: McpServer,
  env: Env,
  auth: McpAuthContext,
  ctx: ExecutionContext,
) {
  server.registerTool('document_create', {
    description: 'Create a new document in the wiki',
    inputSchema: {
      title: z.string().describe('Document title'),
      content: z.string().optional().describe('Markdown content'),
      folderId: z.string().optional().describe('Parent folder ID'),
      category: z.string().optional().describe('Document category'),
      tags: z.array(z.string()).optional().describe('Tags to apply'),
      accessLevel: z.enum(['private', 'specific', 'public']).optional().describe('Access level'),
    },
  }, async (args) => {
    if (!checkPermission(auth.scopes, 'doc:create')) return toolError('Permission denied: doc:create required')
    return safeToolCall(async () => {
      const result = await createDocument(env as never, auth.tenantId, auth.userId, args)
      logMcpAudit(ctx, env, auth, 'document.create', 'document', result.id)
      return result
    })
  })

  server.registerTool('document_get', {
    description: 'Get a document by ID or slug. Returns full content + tags + metadata.',
    inputSchema: {
      id: z.string().optional().describe('Document ID'),
      slug: z.string().optional().describe('Document slug'),
    },
  }, async (args) => {
    if (!checkPermission(auth.scopes, 'doc:read')) return toolError('Permission denied: doc:read required')
    return safeToolCall(async () => {
      const doc = args.id
        ? await getDocument(env as never, auth.tenantId, args.id)
        : args.slug
          ? await getDocumentBySlug(env as never, auth.tenantId, args.slug)
          : null
      if (!doc) return toolError('Document not found')
      return {
        content: [
          { type: 'text' as const, text: `# ${doc.title}\n\n${doc.content}` },
          { type: 'text' as const, text: `\n\n---\nMetadata: ${JSON.stringify({ id: doc.id, slug: doc.slug, category: doc.category, tags: doc.tags, updatedAt: doc.updatedAt })}` },
        ],
      }
    }, (r) => r as never)
  })

  server.registerTool('document_list', {
    description: 'List documents with pagination and filters',
    inputSchema: {
      limit: z.number().int().min(1).max(100).default(20).describe('Max results'),
      offset: z.number().int().min(0).default(0).describe('Offset for pagination'),
      folderId: z.string().optional().describe('Filter by folder ID'),
      category: z.string().optional().describe('Filter by category'),
      tag: z.string().optional().describe('Filter by tag'),
      search: z.string().optional().describe('Title search filter'),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    if (!checkPermission(auth.scopes, 'doc:read')) return toolError('Permission denied: doc:read required')
    const { limit, offset, ...filters } = args
    return safeToolCall(() =>
      listDocuments(env as never, auth.tenantId, { limit, offset }, filters),
    )
  })

  server.registerTool('document_update', {
    description: 'Update a document. Automatically creates a version checkpoint if content changed and 5+ minutes since last version.',
    inputSchema: {
      id: z.string().describe('Document ID'),
      title: z.string().optional().describe('New title'),
      content: z.string().optional().describe('New markdown content'),
      folderId: z.string().nullable().optional().describe('Move to folder (null to unset)'),
      category: z.string().nullable().optional().describe('Set category'),
      tags: z.array(z.string()).optional().describe('Replace tags'),
      accessLevel: z.enum(['private', 'specific', 'public']).optional().describe('Access level'),
    },
  }, async (args) => {
    if (!checkPermission(auth.scopes, 'doc:update')) return toolError('Permission denied: doc:update required')
    const { id, ...input } = args
    return safeToolCall(async () => {
      const result = await updateDocument(env as never, auth.tenantId, id, auth.userId, input)
      if (!result) return toolError('Document not found')
      logMcpAudit(ctx, env, auth, 'document.update', 'document', id)
      return result
    }, (r) => r as never)
  })

  server.registerTool('document_delete', {
    description: 'Soft-delete a document (sets deletedAt timestamp, recoverable)',
    inputSchema: { id: z.string().describe('Document ID to delete') },
    annotations: { destructiveHint: true },
  }, async (args) => {
    if (!checkPermission(auth.scopes, 'doc:delete')) return toolError('Permission denied: doc:delete required')
    return safeToolCall(async () => {
      await deleteDocument(env as never, auth.tenantId, args.id)
      logMcpAudit(ctx, env, auth, 'document.delete', 'document', args.id)
      return { deleted: true, id: args.id }
    })
  })

  server.registerTool('document_versions_list', {
    description: 'Get version history for a document',
    inputSchema: { documentId: z.string().describe('Document ID') },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    if (!checkPermission(auth.scopes, 'doc:read')) return toolError('Permission denied: doc:read required')
    return safeToolCall(() => getVersionHistory(env as never, args.documentId))
  })

  server.registerTool('document_version_create', {
    description: 'Create a manual version checkpoint for a document',
    inputSchema: { documentId: z.string().describe('Document ID') },
  }, async (args) => {
    if (!checkPermission(auth.scopes, 'doc:update')) return toolError('Permission denied: doc:update required')
    return safeToolCall(async () => {
      const result = await createVersionCheckpoint(env as never, auth.tenantId, args.documentId, auth.userId)
      if (!result) return toolError('Document not found')
      logMcpAudit(ctx, env, auth, 'document.version.create', 'document', args.documentId)
      return result
    }, (r) => r as never)
  })

  server.registerTool('document_links_get', {
    description: 'Get forward links and backlinks for a document (wikilink connections)',
    inputSchema: { documentId: z.string().describe('Document ID') },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    if (!checkPermission(auth.scopes, 'doc:read')) return toolError('Permission denied: doc:read required')
    return safeToolCall(() => getDocumentLinks(env as never, args.documentId))
  })
}
