/** MCP prompts — reusable message templates for AI workflows (4 prompts) */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export function registerWikiPrompts(server: McpServer) {
  server.registerPrompt('search_and_summarize', {
    description: 'Search the AgentWiki knowledge base and summarize key findings',
    argsSchema: {
      query: z.string().describe('What to search for'),
      maxResults: z.string().optional().describe('Max results to consider (default 5)'),
    },
  }, async (args) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Search the AgentWiki knowledge base for "${args.query}" using the search tool with hybrid mode. Analyze the top ${args.maxResults ?? '5'} results and provide a concise summary of the key findings, citing specific documents by title.`,
      },
    }],
  }))

  server.registerPrompt('create_from_template', {
    description: 'Create a new document from a category template with suggested structure',
    argsSchema: {
      category: z.string().describe('Document category (e.g. runbook, adr, onboarding)'),
      title: z.string().describe('Document title'),
    },
  }, async (args) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Create a new document titled "${args.title}" in the "${args.category}" category using the document_create tool. Use the following template structure based on the category:\n\n` +
          `- **runbook**: ## Overview, ## Prerequisites, ## Steps, ## Troubleshooting, ## Contacts\n` +
          `- **adr**: ## Status, ## Context, ## Decision, ## Consequences\n` +
          `- **onboarding**: ## Welcome, ## Setup, ## Key Resources, ## FAQ\n` +
          `- **default**: ## Overview, ## Details, ## References\n\n` +
          `Fill in placeholder content that the user can customize later.`,
      },
    }],
  }))

  server.registerPrompt('explore_connections', {
    description: 'Explore document connections via the knowledge graph to find related content',
    argsSchema: {
      documentId: z.string().describe('Starting document ID'),
      depth: z.string().optional().describe('How many link hops to explore (default 2)'),
    },
  }, async (args) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Explore the connections of document "${args.documentId}" in AgentWiki:\n\n` +
          `1. Use document_links_get to find forward links and backlinks\n` +
          `2. Use document_get on each linked document to understand the context\n` +
          `3. Follow links up to ${args.depth ?? '2'} hops deep\n` +
          `4. Use graph_get to visualize the broader neighborhood\n\n` +
          `Present a map of how this document connects to others, with brief summaries of each connected document.`,
      },
    }],
  }))

  server.registerPrompt('review_document', {
    description: 'Review a document for quality, completeness, and suggest improvements',
    argsSchema: {
      documentId: z.string().describe('Document ID to review'),
    },
  }, async (args) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Review document "${args.documentId}" from AgentWiki:\n\n` +
          `1. Use document_get to read the full content\n` +
          `2. Use document_links_get to check for broken or missing links\n` +
          `3. Search for related documents that should be cross-referenced\n\n` +
          `Provide feedback on:\n` +
          `- **Completeness**: Are there gaps in the content?\n` +
          `- **Clarity**: Is the writing clear and well-structured?\n` +
          `- **Connections**: Are there documents that should be linked?\n` +
          `- **Metadata**: Are tags, category, and folder appropriate?\n` +
          `- **Suggestions**: Specific improvements to make`,
      },
    }],
  }))
}
