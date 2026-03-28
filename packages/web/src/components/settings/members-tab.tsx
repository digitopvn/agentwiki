/** Members tab — list, invite, update role, remove members */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, UserPlus } from 'lucide-react'
import { ROLES } from '@agentwiki/shared'
import { apiClient } from '../../lib/api-client'
import { cn } from '../../lib/utils'

interface Member {
  id: string
  userId: string
  role: string
  joinedAt: string
  userName: string
  userEmail: string
  userAvatar: string | null
}

type InviteRole = (typeof ROLES)[number]

export function MembersTab({ isDark }: { isDark: boolean }) {
  const qc = useQueryClient()
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<InviteRole>('viewer')
  const [inviteMsg, setInviteMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['members'],
    queryFn: () => apiClient.get<{ members: Member[] }>('/api/members'),
  })

  const invite = useMutation({
    mutationFn: (body: { email: string; role: string }) =>
      apiClient.post<{ member: Member }>('/api/members/invite', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] })
      setInviteEmail('')
      setInviteRole('viewer')
      setShowInvite(false)
      setInviteMsg({ type: 'success', text: 'Member invited successfully.' })
      setTimeout(() => setInviteMsg(null), 4000)
    },
    onError: (err: Error) => {
      setInviteMsg({ type: 'error', text: err.message })
    },
  })

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      apiClient.patch(`/api/members/${id}`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  })

  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/members/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  })

  const members = data?.members ?? []

  const inputCls = cn(
    'w-full rounded border px-2.5 py-1.5 text-base outline-none md:text-xs',
    isDark
      ? 'border-white/[0.06] bg-surface-2 text-neutral-200 placeholder-neutral-600'
      : 'border-neutral-200 bg-neutral-50 text-neutral-800 placeholder-neutral-400',
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={cn('text-sm font-semibold', isDark ? 'text-neutral-200' : 'text-neutral-800')}>
            Members
          </h2>
          <p className={cn('text-xs mt-0.5', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
            Manage workspace members and their roles.
          </p>
        </div>
        <button
          onClick={() => { setShowInvite((v) => !v); setInviteMsg(null) }}
          className="flex cursor-pointer items-center gap-1.5 rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Invite member
        </button>
      </div>

      {/* Status messages */}
      {inviteMsg && (
        <p className={cn('text-xs', inviteMsg.type === 'error' ? 'text-red-400' : 'text-green-400')}>
          {inviteMsg.text}
        </p>
      )}

      {/* Invite form */}
      {showInvite && (
        <div className={cn('rounded-lg border p-3 space-y-3', isDark ? 'border-white/[0.06] bg-surface-1' : 'border-neutral-200 bg-white')}>
          <p className={cn('text-xs font-medium', isDark ? 'text-neutral-300' : 'text-neutral-700')}>Invite by email</p>
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="user@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className={cn(inputCls, 'flex-1')}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as InviteRole)}
              className={cn(inputCls, 'w-28')}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => invite.mutate({ email: inviteEmail, role: inviteRole })}
              disabled={invite.isPending || !inviteEmail}
              className="cursor-pointer rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {invite.isPending ? 'Inviting...' : 'Send invite'}
            </button>
            <button
              onClick={() => setShowInvite(false)}
              className={cn('cursor-pointer rounded px-3 py-1.5 text-xs', isDark ? 'text-neutral-400 hover:text-neutral-200' : 'text-neutral-500 hover:text-neutral-700')}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Members list */}
      {isLoading ? (
        <p className={cn('py-6 text-center text-xs', isDark ? 'text-neutral-500' : 'text-neutral-400')}>Loading...</p>
      ) : members.length === 0 ? (
        <p className={cn('py-6 text-center text-xs', isDark ? 'text-neutral-500' : 'text-neutral-400')}>No members yet.</p>
      ) : (
        <div className={cn('rounded-lg border divide-y', isDark ? 'border-white/[0.06] divide-white/[0.04]' : 'border-neutral-200 divide-neutral-100')}>
          {members.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              isDark={isDark}
              onRoleChange={(role) => {
                if (window.confirm(`Change ${m.userName}'s role to "${role}"?`)) updateRole.mutate({ id: m.id, role })
              }}
              onRemove={() => {
                if (window.confirm(`Remove ${m.userName} from the workspace?`)) remove.mutate(m.id)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Single member row with avatar, info, role selector, remove button */
function MemberRow({
  member,
  isDark,
  onRoleChange,
  onRemove,
}: {
  member: Member
  isDark: boolean
  onRoleChange: (role: string) => void
  onRemove: () => void
}) {
  const initials = member.userName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      {/* Avatar */}
      {member.userAvatar ? (
        <img src={member.userAvatar} alt={member.userName} className="h-7 w-7 rounded-full object-cover flex-shrink-0" />
      ) : (
        <div className={cn('flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold', isDark ? 'bg-surface-2 text-neutral-400' : 'bg-neutral-100 text-neutral-600')}>
          {initials}
        </div>
      )}

      {/* Name / email */}
      <div className="flex-1 min-w-0">
        <p className={cn('text-xs font-medium truncate', isDark ? 'text-neutral-200' : 'text-neutral-800')}>{member.userName}</p>
        <p className={cn('text-[11px] truncate', isDark ? 'text-neutral-500' : 'text-neutral-400')}>{member.userEmail}</p>
      </div>

      {/* Role selector */}
      <select
        value={member.role}
        onChange={(e) => onRoleChange(e.target.value)}
        className={cn(
          'rounded border px-2 py-1 text-xs outline-none',
          isDark ? 'border-white/[0.06] bg-surface-2 text-neutral-300' : 'border-neutral-200 bg-white text-neutral-700',
        )}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="cursor-pointer rounded p-1 text-red-400 hover:bg-red-500/10"
        title="Remove member"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
