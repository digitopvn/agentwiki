/** Document properties: title, category, access level, dates */

import { useState, useEffect } from 'react'
import { Lock, Globe, Users, Calendar, User } from 'lucide-react'
import { useDocument, useUpdateDocument } from '../../hooks/use-documents'
import { useAppStore } from '../../stores/app-store'
import { cn } from '../../lib/utils'
import { ShareLinkDisplay } from './share-link-display'

const ACCESS_LEVEL_OPTIONS = [
  { value: 'private', label: 'Private', icon: Lock },
  { value: 'specific', label: 'Specific users', icon: Users },
  { value: 'public', label: 'Public', icon: Globe },
] as const

interface DocumentPropertiesProps {
  documentId: string
}

export function DocumentProperties({ documentId }: DocumentPropertiesProps) {
  const { data: doc } = useDocument(documentId)
  const updateDocument = useUpdateDocument()
  const { theme } = useAppStore()

  const [category, setCategory] = useState(doc?.category ?? '')
  const [accessLevel, setAccessLevel] = useState(doc?.accessLevel ?? 'private')

  useEffect(() => {
    if (doc) {
      setCategory(doc.category ?? '')
      setAccessLevel(doc.accessLevel)
    }
  }, [doc])

  const isDark = theme === 'dark'
  const labelCls = cn('text-xs font-medium', isDark ? 'text-neutral-400' : 'text-neutral-500')
  const valueCls = cn('text-xs', isDark ? 'text-neutral-200' : 'text-neutral-800')
  const inputCls = cn(
    'w-full rounded border px-2 py-1.5 text-base outline-none focus:ring-1 focus:ring-blue-500 md:py-1 md:text-xs',
    isDark
      ? 'border-neutral-700 bg-neutral-800 text-neutral-100 placeholder-neutral-500'
      : 'border-neutral-300 bg-white text-neutral-900',
  )

  if (!doc) return null

  const handleCategoryBlur = async () => {
    if (category === (doc.category ?? '')) return
    try {
      await updateDocument.mutateAsync({ id: documentId, category: category || null })
    } catch (err) {
      console.error('Failed to update category:', err)
    }
  }

  const handleAccessLevelChange = async (val: string) => {
    setAccessLevel(val as typeof accessLevel)
    try {
      await updateDocument.mutateAsync({ id: documentId, accessLevel: val })
    } catch (err) {
      console.error('Failed to update access level:', err)
    }
  }

  const formatDate = (d: Date | string) =>
    new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

  return (
    <div className="space-y-3">
      <h3 className={cn('text-xs font-semibold uppercase tracking-wider', isDark ? 'text-neutral-400' : 'text-neutral-500')}>
        Document info
      </h3>

      {/* Category */}
      <div className="space-y-1">
        <label className={labelCls}>Category</label>
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          onBlur={handleCategoryBlur}
          placeholder="e.g. Engineering, Product..."
          className={inputCls}
        />
      </div>

      {/* Access level */}
      <div className="space-y-1">
        <label className={labelCls}>Access level</label>
        <div className="flex flex-col gap-1">
          {ACCESS_LEVEL_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => handleAccessLevelChange(value)}
              className={cn(
                'flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors',
                accessLevel === value
                  ? 'bg-blue-600 text-white'
                  : isDark
                    ? 'text-neutral-300 hover:bg-neutral-800'
                    : 'text-neutral-600 hover:bg-neutral-100',
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
            </button>
          ))}
        </div>
        {(accessLevel === 'public' || accessLevel === 'specific') && (
          <ShareLinkDisplay documentId={documentId} />
        )}
      </div>

      {/* Dates */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Calendar className="h-3 w-3 text-neutral-500" />
          <span className={labelCls}>Created</span>
          <span className={cn(valueCls, 'ml-auto')}>{formatDate(doc.createdAt)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-3 w-3 text-neutral-500" />
          <span className={labelCls}>Updated</span>
          <span className={cn(valueCls, 'ml-auto')}>{formatDate(doc.updatedAt)}</span>
        </div>
        <div className="flex items-center gap-2">
          <User className="h-3 w-3 text-neutral-500" />
          <span className={labelCls}>Author</span>
          <span className={cn(valueCls, 'ml-auto truncate max-w-[120px]')}>{doc.authorName ?? doc.createdBy}</span>
        </div>
      </div>
    </div>
  )
}
