import { sqliteTable, text, integer, real, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

/** Tenant (organization/workspace) */
export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: text('plan').notNull().default('free'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

/** User account */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  provider: text('provider').notNull(), // google | github
  providerId: text('provider_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

/** Tenant membership (user ↔ tenant relationship) */
export const tenantMemberships = sqliteTable('tenant_memberships', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  userId: text('user_id').notNull().references(() => users.id),
  role: text('role').notNull().default('viewer'), // admin | editor | viewer | agent
  invitedBy: text('invited_by'),
  joinedAt: integer('joined_at', { mode: 'timestamp_ms' }).notNull(),
})

/** Session (refresh tokens) */
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  tokenHash: text('token_hash').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

/** API keys for agent/CLI access */
export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  keyPrefix: text('key_prefix').notNull(), // first 8 chars for identification
  keyHash: text('key_hash').notNull(),
  keySalt: text('key_salt').notNull(),
  scopes: text('scopes', { mode: 'json' }).$type<string[]>().notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

/** Immutable audit log */
export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id'),
  action: text('action').notNull(),
  resourceType: text('resource_type'),
  resourceId: text('resource_id'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

/** Documents (knowledge items) */
export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  folderId: text('folder_id'),
  position: text('position').notNull().default('a0'), // fractional indexing for manual sort order
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  content: text('content').notNull().default(''), // markdown body
  contentJson: text('content_json', { mode: 'json' }).$type<unknown>(), // BlockNote JSON
  summary: text('summary'), // AI-generated
  category: text('category'),
  accessLevel: text('access_level').notNull().default('private'),
  contentHash: text('content_hash'), // SHA-256 hash for embedding skip (Phase 1)
  createdBy: text('created_by').notNull().references(() => users.id),
  updatedBy: text('updated_by'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
}, (table) => [
  index('idx_documents_tenant_folder_position').on(table.tenantId, table.folderId, table.position),
])

/** Document tags (many-to-many) */
export const documentTags = sqliteTable('document_tags', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull().references(() => documents.id),
  tag: text('tag').notNull(),
})

/** Document version history (append-only) */
export const documentVersions = sqliteTable('document_versions', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull().references(() => documents.id),
  version: integer('version').notNull(),
  content: text('content').notNull(),
  contentJson: text('content_json', { mode: 'json' }).$type<unknown>(),
  changeSummary: text('change_summary'),
  createdBy: text('created_by').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

/** Wikilinks between documents (typed edges for knowledge graph) */
export const documentLinks = sqliteTable('document_links', {
  id: text('id').primaryKey(),
  sourceDocId: text('source_doc_id').notNull().references(() => documents.id),
  targetDocId: text('target_doc_id').notNull().references(() => documents.id),
  context: text('context'), // surrounding text for preview
  type: text('type').notNull().default('relates-to'), // EdgeType: relates-to | depends-on | extends | references | contradicts | implements
  weight: real('weight').default(1.0), // relationship strength 0-1
  inferred: integer('inferred').default(0), // 0=explicit, 1=ai-inferred, 2=user-confirmed
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

/** Cached document similarities from Vectorize (implicit graph edges) */
export const documentSimilarities = sqliteTable('document_similarities', {
  id: text('id').primaryKey(),
  sourceDocId: text('source_doc_id').notNull().references(() => documents.id),
  targetDocId: text('target_doc_id').notNull().references(() => documents.id),
  score: real('score').notNull(), // cosine similarity 0-1
  computedAt: integer('computed_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  index('idx_similarities_source').on(table.sourceDocId),
  uniqueIndex('idx_similarities_pair').on(table.sourceDocId, table.targetDocId),
])

/** Folders for document organization */
export const folders = sqliteTable('folders', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  parentId: text('parent_id'),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'), // optional context for AI agents (Phase 3)
  positionIndex: text('position_index').notNull().default('a0'), // fractional indexing for manual sort order
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  index('idx_folders_tenant_position').on(table.tenantId, table.positionIndex),
])

/** Share links for documents */
export const shareLinks = sqliteTable('share_links', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull().references(() => documents.id),
  token: text('token').notNull().unique(),
  accessLevel: text('access_level').notNull().default('read'),
  createdBy: text('created_by').notNull().references(() => users.id),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

/** AI provider settings per tenant (encrypted API keys) */
export const aiSettings = sqliteTable('ai_settings', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  providerId: text('provider_id').notNull(),
  encryptedApiKey: text('encrypted_api_key').notNull(),
  defaultModel: text('default_model').notNull(),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

/** AI usage tracking for token consumption monitoring */
export const aiUsage = sqliteTable('ai_usage', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  userId: text('user_id').notNull().references(() => users.id),
  providerId: text('provider_id').notNull(),
  model: text('model').notNull(),
  action: text('action').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

/** File uploads (R2 metadata) */
export const uploads = sqliteTable('uploads', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  documentId: text('document_id'),
  fileKey: text('file_key').notNull(),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  uploadedBy: text('uploaded_by').notNull().references(() => users.id),
  extractionStatus: text('extraction_status').default('pending'), // pending | processing | completed | failed | unsupported
  summary: text('summary'), // AI-generated summary of extracted text
  lastDispatchedAt: integer('last_dispatched_at', { mode: 'timestamp_ms' }), // last extraction job dispatch time
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

/** Extracted text from uploaded files (separated due to large text size) */
export const fileExtractions = sqliteTable('file_extractions', {
  id: text('id').primaryKey(),
  uploadId: text('upload_id').notNull().references(() => uploads.id, { onDelete: 'cascade' }),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  extractedText: text('extracted_text').notNull(),
  charCount: integer('char_count').default(0),
  chunkCount: integer('chunk_count').default(0), // actual number of Vectorize vectors stored
  vectorId: text('vector_id'), // prefix for Vectorize vector IDs
  extractionMethod: text('extraction_method'), // docling | gemini | direct | unsupported
  errorMessage: text('error_message'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  index('idx_file_extractions_upload').on(table.uploadId),
  index('idx_file_extractions_tenant').on(table.tenantId),
])

/** Trigram index for fuzzy search */
export const searchTrigrams = sqliteTable('search_trigrams', {
  trigram: text('trigram').notNull(),
  documentId: text('document_id').notNull().references(() => documents.id),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  field: text('field').notNull(), // 'title' | 'summary' | 'content'
  frequency: integer('frequency').notNull().default(1),
}, (table) => [
  primaryKey({ columns: [table.trigram, table.documentId, table.field] }),
  index('idx_trigram_tenant').on(table.trigram, table.tenantId),
])

/** Search history for autocomplete suggestions */
export const searchHistory = sqliteTable('search_history', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  query: text('query').notNull(),
  resultCount: integer('result_count').notNull(),
  searchCount: integer('search_count').notNull().default(1),
  lastSearchedAt: integer('last_searched_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  uniqueIndex('idx_history_tenant_query').on(table.tenantId, table.query),
])

/** Search analytics for tracking queries and clicks */
export const searchAnalytics = sqliteTable('search_analytics', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  query: text('query').notNull(),
  searchType: text('search_type').notNull(), // 'hybrid' | 'keyword' | 'semantic'
  resultCount: integer('result_count').notNull(),
  clickedDocId: text('clicked_doc_id'),
  clickPosition: integer('click_position'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  index('idx_analytics_tenant_date').on(table.tenantId, table.createdAt),
  index('idx_analytics_tenant_query').on(table.tenantId, table.query),
])

/** User preferences (per-user per-tenant key-value store) */
export const userPreferences = sqliteTable('user_preferences', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  key: text('key').notNull(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  uniqueIndex('idx_user_pref_unique').on(table.userId, table.tenantId, table.key),
])

/** Import jobs for tracking bulk document imports */
export const importJobs = sqliteTable('import_jobs', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  userId: text('user_id').notNull().references(() => users.id),
  source: text('source').notNull(), // obsidian | notion | lark
  status: text('status').notNull().default('pending'), // pending | processing | completed | failed
  targetFolderId: text('target_folder_id'),
  totalDocs: integer('total_docs').notNull().default(0),
  processedDocs: integer('processed_docs').notNull().default(0),
  totalAttachments: integer('total_attachments').notNull().default(0),
  processedAttachments: integer('processed_attachments').notNull().default(0),
  errorCount: integer('error_count').notNull().default(0),
  errors: text('errors', { mode: 'json' }).$type<{ path: string; message: string }[]>(),
  fileKey: text('file_key'), // R2 temp ZIP key
  larkConfig: text('lark_config', { mode: 'json' }).$type<{ token: string; spaceId?: string }>(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
}, (table) => [
  index('idx_import_jobs_tenant').on(table.tenantId),
  index('idx_import_jobs_status').on(table.status),
])
