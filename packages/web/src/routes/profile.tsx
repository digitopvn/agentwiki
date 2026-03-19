/** Profile page: view and edit personal info */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, LogOut } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../hooks/use-auth'
import { useAppStore } from '../stores/app-store'
import { apiClient } from '../lib/api-client'
import { cn } from '../lib/utils'

export function ProfilePage() {
  const { user } = useAuth()
  const { theme } = useAppStore()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isDark = theme === 'dark'

  const userName = user?.name ?? ''
  const userEmail = user?.email ?? ''
  const [name, setName] = useState(userName)

  const updateProfile = useMutation({
    mutationFn: (body: { name: string }) =>
      fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      }).then((r) => { if (!r.ok) throw new Error('Failed'); return r.json() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'me'] }),
  })

  const handleLogout = async () => {
    try {
      await apiClient.post('/api/auth/logout')
      window.location.href = '/login'
    } catch {
      window.location.href = '/login'
    }
  }

  const handleSave = async () => {
    if (!name.trim()) return
    await updateProfile.mutateAsync({ name: name.trim() })
  }

  if (!user) {
    return (
      <div className={cn('flex h-screen items-center justify-center', isDark ? 'bg-surface-0' : 'bg-neutral-50')}>
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-800 border-t-brand-500" />
      </div>
    )
  }

  const inputCls = cn(
    'w-full rounded-lg border px-3 py-2 text-base outline-none md:text-sm',
    isDark
      ? 'border-white/[0.06] bg-surface-2 text-neutral-100 focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/30'
      : 'border-neutral-200 bg-white text-neutral-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30',
  )

  const labelCls = cn('block text-xs font-medium mb-1.5', isDark ? 'text-neutral-400' : 'text-neutral-500')

  return (
    <div className={cn('min-h-screen', isDark ? 'bg-surface-0' : 'bg-neutral-50')}>
      {/* Header */}
      <div className={cn('border-b px-4 py-4 md:px-6', isDark ? 'border-white/[0.06]' : 'border-neutral-200')}>
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button onClick={() => navigate('/')} className={cn('cursor-pointer rounded-lg p-2 md:p-1.5', isDark ? 'hover:bg-surface-3 active:bg-surface-3 text-neutral-400' : 'hover:bg-neutral-100 active:bg-neutral-100 text-neutral-500')}>
            <ArrowLeft className="h-5 w-5 md:h-4 md:w-4" />
          </button>
          <h1 className={cn('text-lg font-semibold', isDark ? 'text-neutral-100' : 'text-neutral-900')}>Profile</h1>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-6 space-y-8 md:px-6 md:py-8">
        {/* Avatar + basic info */}
        <div className="flex items-center gap-4">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="h-16 w-16 rounded-full" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-xl font-bold text-white">
              {userName.charAt(0).toUpperCase() || '?'}
            </div>
          )}
          <div>
            <p className={cn('text-lg font-semibold', isDark ? 'text-neutral-100' : 'text-neutral-900')}>{userName}</p>
            <p className={cn('text-sm', isDark ? 'text-neutral-400' : 'text-neutral-500')}>{userEmail}</p>
            <span className={cn('mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase', isDark ? 'bg-surface-3 text-neutral-400' : 'bg-neutral-100 text-neutral-500')}>
              {user?.provider ?? 'oauth'}
            </span>
          </div>
        </div>

        {/* Edit form */}
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Display name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input type="email" value={userEmail} disabled className={cn(inputCls, 'opacity-60 cursor-not-allowed')} />
          </div>
          <button
            onClick={handleSave}
            disabled={updateProfile.isPending || name.trim() === userName}
            className="flex cursor-pointer items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 active:bg-brand-500 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {updateProfile.isPending ? 'Saving...' : 'Save changes'}
          </button>
        </div>

        {/* Danger zone */}
        <div className={cn('rounded-lg border p-4', isDark ? 'border-red-500/20' : 'border-red-200')}>
          <h3 className="text-sm font-medium text-red-400">Sign out</h3>
          <p className={cn('mt-1 text-xs', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
            Sign out of your account on this device.
          </p>
          <button onClick={handleLogout} className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 active:bg-red-500/10 md:py-1.5 md:text-xs">
            <LogOut className="h-3 w-3" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
