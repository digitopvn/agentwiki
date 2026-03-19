/** McpServer factory — creates a server instance with all tools, resources, and prompts */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerDocumentTools } from './tools/document-tools'
import { registerSearchAndGraphTools } from './tools/search-and-graph-tools'
import { registerFolderTools } from './tools/folder-tools'
import { registerTagTools } from './tools/tag-tools'
import { registerUploadTools } from './tools/upload-tools'
import { registerMemberTools } from './tools/member-tools'
import { registerApiKeyTools } from './tools/api-key-tools'
import { registerShareTools } from './tools/share-tools'
import { registerWikiResources } from './resources/wiki-resources'
import { registerWikiPrompts } from './prompts/wiki-prompts'
import type { Env, McpAuthContext } from './env'

/** Create an McpServer with all tools/resources/prompts bound to auth context */
export function createMcpServer(
  env: Env,
  auth: McpAuthContext,
  ctx: ExecutionContext,
): McpServer {
  const server = new McpServer({
    name: 'agentwiki',
    version: '1.0.0',
  })

  // Register all tools (25 total)
  registerDocumentTools(server, env, auth, ctx)
  registerSearchAndGraphTools(server, env, auth, ctx)
  registerFolderTools(server, env, auth, ctx)
  registerTagTools(server, env, auth, ctx)
  registerUploadTools(server, env, auth, ctx)
  registerMemberTools(server, env, auth, ctx)
  registerApiKeyTools(server, env, auth, ctx)
  registerShareTools(server, env, auth, ctx)

  // Register resources (6) and prompts (4)
  registerWikiResources(server, env, auth)
  registerWikiPrompts(server)

  return server
}
