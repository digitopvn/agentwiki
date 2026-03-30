/** Upload progress bars for active uploads in storage drawer */

import { X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAppStore, type UploadQueueItem } from '../../stores/app-store'

export function UploadProgressList({ isDark }: { isDark: boolean }) {
  const { uploadQueue, removeFromUploadQueue } = useAppStore()

  const activeUploads = uploadQueue.filter((u) => u.status !== 'complete')
  if (!activeUploads.length) return null

  return (
    <div className="space-y-1.5 px-3 pb-2">
      {activeUploads.map((item) => (
        <UploadProgressItem key={item.id} item={item} isDark={isDark} onRemove={removeFromUploadQueue} />
      ))}
    </div>
  )
}

function UploadProgressItem({ item, isDark, onRemove }: { item: UploadQueueItem; isDark: boolean; onRemove: (id: string) => void }) {
  const isError = item.status === 'error'

  return (
    <div className={cn('rounded-lg border p-2', isDark ? 'border-white/[0.06] bg-surface-2' : 'border-neutral-200 bg-neutral-50')}>
      <div className="flex items-center justify-between mb-1">
        <span className={cn('truncate text-[11px] font-medium max-w-[80%]', isDark ? 'text-neutral-300' : 'text-neutral-700')}>
          {item.file.name}
        </span>
        {(isError || item.status === 'complete') && (
          <button onClick={() => onRemove(item.id)} className="text-neutral-500 hover:text-neutral-300">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {/* Progress bar */}
      <div className={cn('h-1.5 w-full rounded-full', isDark ? 'bg-surface-3' : 'bg-neutral-200')}>
        <div
          className={cn('h-full rounded-full transition-all duration-300', isError ? 'bg-red-500' : 'bg-brand-500')}
          style={{ width: `${item.progress}%` }}
        />
      </div>
      {isError && (
        <p className="mt-1 text-[10px] text-red-400">{item.error ?? 'Upload failed'}</p>
      )}
    </div>
  )
}
