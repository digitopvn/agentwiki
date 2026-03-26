/** R2 storage configuration card — admin form for custom R2 credentials */

import { useState } from 'react'
import { Settings2, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import {
  useStorageConfig,
  useUpdateStorageConfig,
  useDeleteStorageConfig,
  useTestStorageConnection,
  type StorageConfig,
} from '../../hooks/use-storage-settings'

const inputClass = (isDark: boolean) =>
  cn(
    'mt-1 w-full rounded border px-2.5 py-1.5 text-base outline-none md:text-xs',
    isDark
      ? 'border-white/[0.08] bg-surface-2 text-neutral-200 placeholder:text-neutral-600 focus:border-brand-500'
      : 'border-neutral-300 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 focus:border-brand-500',
  )

const labelClass = (isDark: boolean) =>
  cn('text-[10px] uppercase tracking-wider', isDark ? 'text-neutral-500' : 'text-neutral-400')

interface Props {
  isDark: boolean
}

export function StorageConfigCard({ isDark }: Props) {
  const { data } = useStorageConfig()
  const updateConfig = useUpdateStorageConfig()
  const deleteConfig = useDeleteStorageConfig()
  const testConnection = useTestStorageConnection()

  const config: StorageConfig | null | undefined = data?.config

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ accountId: '', accessKey: '', secretKey: '', bucketName: '' })
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null)

  const handleToggle = () => {
    if (!showForm && config) {
      setForm({ accountId: config.accountId, bucketName: config.bucketName, accessKey: '', secretKey: '' })
    }
    setShowForm((v) => !v)
    setTestResult(null)
  }

  const handleChange = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      accountId: form.accountId,
      bucketName: form.bucketName,
      accessKey: form.accessKey || '__unchanged__',
      secretKey: form.secretKey || '__unchanged__',
    }
    await updateConfig.mutateAsync(payload)
    setShowForm(false)
  }

  const handleTest = async () => {
    const result = await testConnection.mutateAsync(undefined)
    setTestResult(result)
  }

  const handleDelete = async () => {
    if (!window.confirm('Remove custom R2 configuration and revert to default?')) return
    await deleteConfig.mutateAsync()
    setShowForm(false)
  }

  return (
    <div className={cn('rounded-lg border p-4 space-y-3', isDark ? 'border-white/[0.06] bg-surface-1' : 'border-neutral-200 bg-white')}>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-brand-400" />
          <span className={cn('text-xs font-semibold', isDark ? 'text-neutral-200' : 'text-neutral-700')}>
            R2 Configuration
          </span>
          {config ? (
            <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium',
              config.isVerified ? 'bg-green-500/15 text-green-400' : 'bg-amber-500/15 text-amber-400',
            )}>
              {config.isVerified ? 'Verified' : 'Not verified'}
            </span>
          ) : (
            <span className="rounded-full bg-neutral-500/15 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">
              Default
            </span>
          )}
        </div>
        <button
          onClick={handleToggle}
          className={cn(
            'rounded px-2 py-1 text-xs font-medium transition-colors',
            isDark ? 'text-neutral-400 hover:text-neutral-200' : 'text-neutral-500 hover:text-neutral-700',
          )}
        >
          {showForm ? 'Hide' : 'Configure'}
        </button>
      </div>

      {/* Config form */}
      {showForm && (
        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass(isDark)}>Account ID</label>
              <input
                className={inputClass(isDark)}
                value={form.accountId}
                onChange={handleChange('accountId')}
                placeholder="abc123..."
                required
              />
            </div>
            <div>
              <label className={labelClass(isDark)}>Bucket Name</label>
              <input
                className={inputClass(isDark)}
                value={form.bucketName}
                onChange={handleChange('bucketName')}
                placeholder="my-bucket"
                required
              />
            </div>
            <div>
              <label className={labelClass(isDark)}>Access Key ID</label>
              <input
                type="password"
                className={inputClass(isDark)}
                value={form.accessKey}
                onChange={handleChange('accessKey')}
                placeholder={config?.hasAccessKey ? '•••••••• (saved)' : 'Enter access key'}
              />
            </div>
            <div>
              <label className={labelClass(isDark)}>Secret Access Key</label>
              <input
                type="password"
                className={inputClass(isDark)}
                value={form.secretKey}
                onChange={handleChange('secretKey')}
                placeholder={config?.hasSecretKey ? '•••••••• (saved)' : 'Enter secret key'}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="submit"
              disabled={updateConfig.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {updateConfig.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Save
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={testConnection.isPending || !config}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50',
                isDark ? 'border-white/[0.08] text-neutral-300 hover:bg-white/[0.04]' : 'border-neutral-300 text-neutral-700 hover:bg-neutral-50',
              )}
            >
              {testConnection.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Test Connection
            </button>
            {config && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteConfig.isPending}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>

          {/* Test result */}
          {testResult && (
            <p className={cn('text-xs', testResult.success ? 'text-green-400' : 'text-red-400')}>
              {testResult.success ? 'Connection successful' : testResult.error ?? 'Connection failed'}
            </p>
          )}

          {/* Save error */}
          {updateConfig.isError && (
            <p className="text-xs text-red-400">
              {updateConfig.error instanceof Error ? updateConfig.error.message : 'Failed to save'}
            </p>
          )}
        </form>
      )}
    </div>
  )
}
