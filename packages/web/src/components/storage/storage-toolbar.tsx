/** Storage toolbar: upload, view toggle, search */

import { useRef } from 'react'
import { Upload, Grid3X3, List, Search } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useUploadFile } from '../../hooks/use-storage'

interface Props {
  currentFolderId: string | null
  viewMode: 'grid' | 'list'
  onViewModeChange: (mode: 'grid' | 'list') => void
  searchQuery: string
  onSearchChange: (q: string) => void
  fileCount: number
}

export function StorageToolbar({ currentFolderId, viewMode, onViewModeChange, searchQuery, onSearchChange, fileCount }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadFile = useUploadFile()

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    for (const file of Array.from(files)) {
      try {
        await uploadFile.mutateAsync({ file, folderId: currentFolderId })
      } catch (err) {
        console.error(`Failed to upload ${file.name}:`, err)
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-2">
      {/* Upload button */}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadFile.isPending}
        className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        <Upload className="h-3.5 w-3.5" />
        {uploadFile.isPending ? 'Uploading...' : 'Upload'}
      </button>
      <input ref={fileInputRef} type="file" multiple onChange={handleUpload} className="hidden" />

      {/* Search */}
      <div className="relative flex-1">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
        <input
          type="text"
          placeholder="Search files..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full max-w-xs rounded-md border border-neutral-700 bg-neutral-800 py-1.5 pl-7 pr-3 text-xs text-neutral-100 placeholder-neutral-500 outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* File count */}
      <span className="text-xs text-neutral-500">{fileCount} files</span>

      {/* View toggle */}
      <div className="flex rounded-md border border-neutral-700">
        <button
          onClick={() => onViewModeChange('grid')}
          className={cn('rounded-l-md p-1.5', viewMode === 'grid' ? 'bg-neutral-700 text-neutral-100' : 'text-neutral-500 hover:text-neutral-300')}
          title="Grid view"
        >
          <Grid3X3 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onViewModeChange('list')}
          className={cn('rounded-r-md p-1.5', viewMode === 'list' ? 'bg-neutral-700 text-neutral-100' : 'text-neutral-500 hover:text-neutral-300')}
          title="List view"
        >
          <List className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
