/** Share link management + public document access */

import { eq, and } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { shareLinks, documents } from '../db/schema'
import { generateId, generateRandomToken } from '../utils/crypto'
import { TOKEN_TTL } from '@agentwiki/shared'
import type { Env } from '../env'

/** Create a share link for a document */
export async function createShareLink(
  env: Env,
  documentId: string,
  userId: string,
  expiresInDays = 30,
) {
  const db = drizzle(env.DB)
  const token = generateRandomToken(32)
  const id = generateId()

  await db.insert(shareLinks).values({
    id,
    documentId,
    token,
    accessLevel: 'read',
    createdBy: userId,
    expiresAt: new Date(Date.now() + expiresInDays * 86400000),
    createdAt: new Date(),
  })

  return { id, token, url: `/share/${token}` }
}

/** Get document by share token (public access) */
export async function getDocumentByShareToken(env: Env, token: string) {
  const db = drizzle(env.DB)

  const link = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1)

  if (!link.length) return null

  // Check expiry
  if (link[0].expiresAt && link[0].expiresAt < new Date()) {
    return null
  }

  const doc = await db
    .select()
    .from(documents)
    .where(eq(documents.id, link[0].documentId))
    .limit(1)

  if (!doc.length) return null

  return {
    document: {
      id: doc[0].id,
      title: doc[0].title,
      content: doc[0].content,
      contentJson: doc[0].contentJson,
      summary: doc[0].summary,
      category: doc[0].category,
      createdAt: doc[0].createdAt,
      updatedAt: doc[0].updatedAt,
    },
    shareLink: {
      expiresAt: link[0].expiresAt,
      accessLevel: link[0].accessLevel,
    },
  }
}

/** List share links for a document */
export async function listShareLinks(env: Env, documentId: string) {
  const db = drizzle(env.DB)
  return db
    .select({
      id: shareLinks.id,
      token: shareLinks.token,
      accessLevel: shareLinks.accessLevel,
      expiresAt: shareLinks.expiresAt,
      createdAt: shareLinks.createdAt,
    })
    .from(shareLinks)
    .where(eq(shareLinks.documentId, documentId))
}

/** Delete a share link */
export async function deleteShareLink(env: Env, linkId: string) {
  const db = drizzle(env.DB)
  await db.delete(shareLinks).where(eq(shareLinks.id, linkId))
}
