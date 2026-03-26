---
phase: 2
title: Members Tab Full CRUD
priority: high
status: completed
effort: M
---

# Phase 2: Members Tab Full CRUD

## Context Links
- [plan.md](./plan.md)
- [Issue #57](https://github.com/digitopvn/agentwiki/issues/57)
- Frontend: `packages/web/src/routes/settings.tsx` (MembersTab, lines 78-150)
- Backend: `packages/api/src/routes/members.ts`
- Schema: `packages/shared/src/schemas/auth.ts` (`inviteUserSchema` already exists)
- DB: `packages/api/src/db/schema.ts` (`tenantMemberships`, has `invitedBy` column)

## Overview

Members tab has List + Update Role + Remove but **no way to add/invite members**. The shared schema `inviteUserSchema` already exists but no backend route uses it. DB table already has `invitedBy` field.

## Key Insights

- `inviteUserSchema` in `packages/shared/src/schemas/auth.ts` validates `{ email: string, role: Role }`
- DB schema `tenantMemberships.invitedBy` already exists — just needs to be populated
- Backend `members.ts` only has GET `/`, PATCH `/:id`, DELETE `/:id` — need POST for invite
- Frontend `MembersTab` is inline in `settings.tsx` — should extract to own component file for size management
- Current PATCH uses `.patch()` on backend but frontend calls `apiClient.put()` — **bug**: need to align (change frontend to PATCH)

## Requirements

**Functional:**
- Admin can invite member by email + role selection
- Invite creates a `tenantMembership` record (user must exist in system via OAuth)
- Show error if email not found (user hasn't signed up yet)
- Show error if user already a member
- After invite: member appears in list immediately
- Existing list/update/remove functionality preserved

**Non-functional:**
- Invite form visible only to admins
- Input validation on email format client-side

## Architecture

```
[Invite Form]  →  POST /api/members/invite  →  lookup user by email
                                              →  check not already member
                                              →  create tenantMembership
                                              →  return member data
```

## Related Code Files

**Modify:**
- `packages/web/src/routes/settings.tsx` — extract MembersTab, add invite form
- `packages/api/src/routes/members.ts` — add POST invite endpoint

**Create:**
- `packages/web/src/components/settings/members-tab.tsx` — extracted component

**Read for context:**
- `packages/api/src/services/member-service.ts`
- `packages/shared/src/schemas/auth.ts`

## Implementation Steps

### Backend (members.ts)
1. Add `POST /api/members/invite` route with `requirePermission('tenant:manage')`
2. Parse body with `inviteUserSchema`
3. Look up user by email in `users` table
4. If not found: return 404 `{ error: 'User not found. They must sign up first.' }`
5. Check if user already has membership in tenant
6. If exists: return 409 `{ error: 'User is already a member' }`
7. Create `tenantMembership` with role, tenantId, userId, invitedBy = current userId
8. Return created member data (joined with user info)
9. Fix: change `PATCH /:id` frontend call from `put()` to `patch()`

### Frontend (members-tab.tsx)
1. Extract `MembersTab` from `settings.tsx` to `packages/web/src/components/settings/members-tab.tsx`
2. Add invite form at top: email input + role dropdown + "Invite" button
3. Add `useMutation` for `POST /api/members/invite`
4. Show success toast or inline message when invited
5. Show error message from API response
6. Invalidate `['members']` query on success
7. Fix: `apiClient.put(...)` → `apiClient.patch(...)` for role update

## Todo

- [x] Add POST /api/members/invite backend endpoint
- [x] Extract MembersTab to own component file
- [x] Add invite form UI (email + role + button)
- [x] Add invite mutation hook
- [x] Fix PUT → PATCH alignment
- [x] Error handling: user not found, already member

## Success Criteria

- Admin can invite existing users by email
- Proper error messages for edge cases
- Member appears in list after invite
- Role update still works (PATCH alignment)
- `pnpm type-check` passes

## Risk Assessment

- **Medium**: Requires backend + frontend changes
- Edge case: user hasn't signed up yet — clear error message needed
- Security: only admins can invite, verified by `tenant:manage` permission
