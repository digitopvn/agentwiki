-- FTS5 virtual table for BM25 full-text search (Phase 0.5 + Phase 1)
-- NOTE: Must use lowercase 'fts5' — D1 is case-sensitive for virtual table modules.
-- NOTE: FTS5 virtual tables cannot be exported via D1 export. Use drop+recreate for backups.
-- SCALABILITY: tenant_id is UNINDEXED — WHERE tenant_id=? is a post-filter after MATCH.
--   At scale, consider per-tenant tables or prefix-token partitioning.

CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  doc_id UNINDEXED,
  tenant_id UNINDEXED,
  title,
  summary,
  content,
  tokenize='porter unicode61'
);

-- Content hash column for embedding skip optimization (Phase 1)
ALTER TABLE documents ADD COLUMN content_hash TEXT;

-- Folder description for AI agent context (Phase 3)
ALTER TABLE folders ADD COLUMN description TEXT;
