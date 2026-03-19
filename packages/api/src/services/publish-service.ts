/** Document publishing — export to HTML + upload to R2 */

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { documents } from '../db/schema'
import { generateId } from '../utils/crypto'
import type { Env } from '../env'

/** Publish a document as static HTML to R2 */
export async function publishDocument(env: Env, documentId: string, tenantId: string) {
  const db = drizzle(env.DB)

  const doc = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1)

  if (!doc.length) return null

  // Generate HTML from markdown content
  const html = renderDocumentHtml(doc[0].title, doc[0].content)

  // Upload to R2
  const publishKey = `${tenantId}/published/${documentId}/index.html`
  await env.R2.put(publishKey, html, {
    httpMetadata: { contentType: 'text/html; charset=utf-8' },
    customMetadata: {
      documentId,
      publishedAt: new Date().toISOString(),
    },
  })

  // Update document access level
  await db
    .update(documents)
    .set({ accessLevel: 'public', updatedAt: new Date() })
    .where(eq(documents.id, documentId))

  return {
    url: `/api/published/${tenantId}/${documentId}`,
    publishedAt: new Date().toISOString(),
  }
}

/** Simple markdown → HTML renderer (server-side) */
function renderDocumentHtml(title: string, markdown: string): string {
  // Basic markdown → HTML conversion (headings, bold, italic, code, links, lists)
  let html = markdown
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')

  html = `<p>${html}</p>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — AgentWiki</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           max-width: 720px; margin: 0 auto; padding: 2rem 1rem;
           color: #1a1a1a; line-height: 1.7; }
    h1 { font-size: 2rem; margin: 1.5rem 0 1rem; }
    h2 { font-size: 1.5rem; margin: 1.25rem 0 0.75rem; }
    h3 { font-size: 1.25rem; margin: 1rem 0 0.5rem; }
    p { margin: 0.75rem 0; }
    code { background: #f3f4f6; padding: 0.15em 0.4em; border-radius: 3px; font-size: 0.9em; }
    pre { background: #f3f4f6; padding: 1rem; border-radius: 6px; overflow-x: auto; margin: 1rem 0; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
    ul, ol { padding-left: 1.5rem; margin: 0.5rem 0; }
    li { margin: 0.25rem 0; }
    .header { border-bottom: 1px solid #e5e7eb; padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .footer { border-top: 1px solid #e5e7eb; padding-top: 1rem; margin-top: 2rem;
              font-size: 0.85rem; color: #6b7280; }
  </style>
</head>
<body>
  <div class="header"><h1>${escapeHtml(title)}</h1></div>
  <div class="content">${html}</div>
  <div class="footer">Published with <a href="https://app.agentwiki.cc">AgentWiki</a></div>
</body>
</html>`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
