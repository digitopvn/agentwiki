# Phase 4: Error Handling + Monitoring

## Context
- [SP1 Plan](./plan.md)
- Phases 1-3 must be completed

## Overview
- **Priority:** P1
- **Status:** Completed
- **Description:** Add retry mechanism for failed/stuck extractions, monitoring endpoints, and cleanup for stale jobs.

## Requirements

### Functional
- Retry mechanism for stuck jobs (status=pending > 15min, status=processing > 10min)
- Admin API to view extraction status summary
- Manual re-trigger extraction for failed files
- Cleanup stale file_extractions on upload delete

### Non-functional
- Use CF Cron Triggers for periodic retry check (every 5 min)
- Log extraction errors in audit_logs

## Implementation Steps

1. **Retry mechanism**
   - Add cron trigger in wrangler.toml (every 5 min)
   - Query uploads where extraction_status=pending AND created_at > 15min ago
   - Query uploads where extraction_status=processing AND updated_at > 10min ago
   - Re-dispatch extraction jobs for these

2. **Admin status endpoint**
   - `GET /api/internal/extraction-status` — returns count by status
   - Useful for monitoring dashboard

3. **Manual re-trigger**
   - `POST /api/uploads/:id/retry-extraction` — re-dispatch job for specific upload
   - Requires admin role

4. **Cascade cleanup**
   - When upload deleted → file_extractions cascade (DB FK)
   - Delete Vectorize vectors for upload (upload-{id}-* IDs)

5. **Audit logging**
   - Log extraction completions/failures in audit_logs
   - Action: `extraction:completed`, `extraction:failed`

## Todo List

- [x] Add cron trigger for retry check
- [x] Implement retry logic for stuck extractions
- [x] Add admin status endpoint
- [x] Add manual re-trigger endpoint
- [x] Ensure cascade cleanup on upload delete
- [x] Add audit logging for extraction events
- [x] Test retry mechanism

## Success Criteria

- Stuck extractions automatically retried within 5 minutes
- Admin can see extraction pipeline health
- Failed extractions can be manually retried
- No orphan vectors after upload deletion
