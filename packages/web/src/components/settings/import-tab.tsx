/** Import tab — upload ZIP (Obsidian/Notion) or connect Lark API */

import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, FileArchive, Globe, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react'
import { apiClient } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import type { ImportJob, ImportProgressEvent, ImportSummary } from '@agentwiki/shared'

type ImportSource = 'obsidian' | 'notion' | 'lark'

interface Props {
  isDark: boolean
}

export function ImportTab({ isDark }: Props) {
  const [source, setSource] = useState<ImportSource>('obsidian')
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [progress, setProgress] = useState<ImportProgressEvent | null>(null)
  const [logs, setLogs] = useState<string[]>([])

  const qc = useQueryClient()

  // Import history
  const { data: history } = useQuery({
    queryKey: ['import-history'],
    queryFn: () => apiClient.get<ImportJob[]>('/api/import'),
  })

  // SSE progress polling
  useEffect(() => {
    if (!activeJobId) return
    let cancelled = false

    async function poll() {
      try {
        const res = await fetch(`/api/import/${activeJobId}/progress`, { credentials: 'include' })
        if (!res.ok || !res.body) return
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (!cancelled) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const event = JSON.parse(line.slice(6)) as ImportProgressEvent
              setProgress(event)
              if (event.type === 'document') setLogs((prev) => [...prev.slice(-50), `✓ ${event.name}`])
              if (event.type === 'error') setLogs((prev) => [...prev.slice(-50), `✗ ${event.message}`])
              if (event.type === 'complete' || event.type === 'error') {
                qc.invalidateQueries({ queryKey: ['import-history'] })
                return
              }
            } catch { /* skip malformed */ }
          }
        }
      } catch { /* connection error */ }
    }

    poll()
    return () => { cancelled = true }
  }, [activeJobId, qc])

  return (
    <div className="space-y-6">
      {/* Source selector */}
      <SourceSelector source={source} onChange={setSource} isDark={isDark} />

      {/* Upload/config form based on source */}
      {source === 'lark' ? (
        <LarkForm isDark={isDark} onJobStart={(id) => { setActiveJobId(id); setProgress(null); setLogs([]) }} />
      ) : (
        <ZipUploadForm source={source} isDark={isDark} onJobStart={(id) => { setActiveJobId(id); setProgress(null); setLogs([]) }} />
      )}

      {/* Active import progress */}
      {activeJobId && progress && (
        <ProgressSection progress={progress} logs={logs} isDark={isDark} />
      )}

      {/* Import history */}
      {history && history.length > 0 && (
        <HistoryTable jobs={history} isDark={isDark} />
      )}
    </div>
  )
}

/** Source selection tabs */
function SourceSelector({ source, onChange, isDark }: { source: ImportSource; onChange: (s: ImportSource) => void; isDark: boolean }) {
  const sources: { id: ImportSource; label: string; icon: typeof FileArchive }[] = [
    { id: 'obsidian', label: 'Obsidian', icon: FileArchive },
    { id: 'notion', label: 'Notion', icon: FileArchive },
    { id: 'lark', label: 'LarkSuite', icon: Globe },
  ]

  return (
    <div>
      <h3 className={cn('text-sm font-medium mb-3', isDark ? 'text-neutral-200' : 'text-neutral-700')}>Import Source</h3>
      <div className="flex gap-2">
        {sources.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium cursor-pointer transition-colors',
              source === id
                ? 'border-brand-500 bg-brand-500/10 text-brand-500'
                : isDark ? 'border-white/[0.06] text-neutral-400 hover:border-white/10' : 'border-neutral-200 text-neutral-500 hover:border-neutral-300',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** ZIP upload form for Obsidian/Notion */
function ZipUploadForm({ source, isDark, onJobStart }: { source: 'obsidian' | 'notion'; isDark: boolean; onJobStart: (id: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const handleSubmit = useCallback(async () => {
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('source', source)

      const res = await fetch('/api/import', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      if (!res.ok) throw new Error(await res.text())
      const { jobId } = await res.json() as { jobId: string }
      onJobStart(jobId)
      setFile(null)
    } catch (err) {
      alert(`Import failed: ${(err as Error).message}`)
    } finally {
      setUploading(false)
    }
  }, [file, source, onJobStart])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const dropped = e.dataTransfer.files[0]
    if (dropped?.name.endsWith('.zip')) setFile(dropped)
  }, [])

  const label = source === 'obsidian' ? 'Obsidian vault' : 'Notion export'

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors',
          isDark ? 'border-white/10 hover:border-white/20 bg-surface-1' : 'border-neutral-200 hover:border-neutral-300 bg-neutral-50',
        )}
      >
        <Upload className={cn('h-8 w-8', isDark ? 'text-neutral-500' : 'text-neutral-400')} />
        <p className={cn('text-sm', isDark ? 'text-neutral-400' : 'text-neutral-500')}>
          {file ? file.name : `Drag & drop ${label} ZIP or click to browse`}
        </p>
        {file && <p className={cn('text-xs', isDark ? 'text-neutral-500' : 'text-neutral-400')}>{(file.size / (1024 * 1024)).toFixed(1)} MB</p>}
        <input ref={fileRef} type="file" accept=".zip" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>

      <button
        onClick={handleSubmit}
        disabled={!file || uploading}
        className={cn(
          'w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer',
          file && !uploading
            ? 'bg-brand-600 text-white hover:bg-brand-700'
            : isDark ? 'bg-surface-2 text-neutral-500 cursor-not-allowed' : 'bg-neutral-100 text-neutral-400 cursor-not-allowed',
        )}
      >
        {uploading ? 'Uploading...' : `Import from ${source === 'obsidian' ? 'Obsidian' : 'Notion'}`}
      </button>
    </div>
  )
}

/** Lark API config form */
function LarkForm({ isDark, onJobStart }: { isDark: boolean; onJobStart: (id: string) => void }) {
  const [token, setToken] = useState('')
  const [spaceId, setSpaceId] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const body: Record<string, string> = { token }
      if (spaceId) body.spaceId = spaceId

      const res = await fetch('/api/import/lark', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      const { jobId } = await res.json() as { jobId: string }
      onJobStart(jobId)
      setToken('')
    } catch (err) {
      alert(`Import failed: ${(err as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [token, spaceId, onJobStart])

  const inputCls = cn(
    'w-full rounded-lg border px-3 py-2 text-sm',
    isDark ? 'border-white/10 bg-surface-1 text-neutral-100 placeholder:text-neutral-500' : 'border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400',
  )

  return (
    <div className="space-y-4">
      <div>
        <label className={cn('block text-xs font-medium mb-1', isDark ? 'text-neutral-400' : 'text-neutral-600')}>Access Token *</label>
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Lark access token" className={inputCls} />
      </div>
      <div>
        <label className={cn('block text-xs font-medium mb-1', isDark ? 'text-neutral-400' : 'text-neutral-600')}>Space ID (optional)</label>
        <input value={spaceId} onChange={(e) => setSpaceId(e.target.value)} placeholder="Lark space ID" className={inputCls} />
      </div>
      <button
        onClick={handleSubmit}
        disabled={!token || loading}
        className={cn(
          'w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer',
          token && !loading
            ? 'bg-brand-600 text-white hover:bg-brand-700'
            : isDark ? 'bg-surface-2 text-neutral-500 cursor-not-allowed' : 'bg-neutral-100 text-neutral-400 cursor-not-allowed',
        )}
      >
        {loading ? 'Starting...' : 'Import from LarkSuite'}
      </button>
    </div>
  )
}

/** Progress bar and log display */
function ProgressSection({ progress, logs, isDark }: { progress: ImportProgressEvent; logs: string[]; isDark: boolean }) {
  const isComplete = progress.type === 'complete'
  const isError = progress.type === 'error' && !progress.summary
  const pct = progress.total && progress.current ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <div className={cn('rounded-xl border p-4', isDark ? 'border-white/[0.06] bg-surface-1' : 'border-neutral-200 bg-white')}>
      <div className="flex items-center gap-2 mb-3">
        {isComplete ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : isError ? <XCircle className="h-4 w-4 text-red-500" /> : <Loader2 className="h-4 w-4 text-brand-500 animate-spin" />}
        <span className={cn('text-sm font-medium', isDark ? 'text-neutral-200' : 'text-neutral-700')}>
          {isComplete ? 'Import complete' : isError ? 'Import failed' : `Importing... ${pct}%`}
        </span>
      </div>

      {/* Progress bar */}
      {!isComplete && !isError && (
        <div className={cn('h-2 rounded-full mb-3 overflow-hidden', isDark ? 'bg-surface-3' : 'bg-neutral-100')}>
          <div className="h-full rounded-full bg-brand-500 transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      )}

      {/* Summary */}
      {progress.summary && <ImportSummaryDisplay summary={progress.summary} isDark={isDark} />}

      {/* Log scroll */}
      {logs.length > 0 && (
        <div className={cn('mt-3 max-h-40 overflow-y-auto rounded-lg p-2 text-xs font-mono', isDark ? 'bg-surface-0' : 'bg-neutral-50')}>
          {logs.map((line, i) => (
            <div key={i} className={cn(line.startsWith('✗') ? 'text-red-400' : isDark ? 'text-neutral-400' : 'text-neutral-500')}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ImportSummaryDisplay({ summary, isDark }: { summary: ImportSummary; isDark: boolean }) {
  const text = isDark ? 'text-neutral-300' : 'text-neutral-600'
  return (
    <div className={cn('grid grid-cols-2 gap-2 text-xs', text)}>
      <div>Folders: {summary.foldersCreated}</div>
      <div>Documents: {summary.documentsCreated}</div>
      <div>Images: {summary.attachmentsUploaded}</div>
      <div>Links: {summary.linksResolved}</div>
      {summary.errors.length > 0 && (
        <div className="col-span-2 flex items-center gap-1 text-amber-500">
          <AlertCircle className="h-3 w-3" /> {summary.errors.length} errors
        </div>
      )}
      <div className="col-span-2 text-neutral-500">Duration: {(summary.durationMs / 1000).toFixed(1)}s</div>
    </div>
  )
}

/** Past imports table */
function HistoryTable({ jobs, isDark }: { jobs: ImportJob[]; isDark: boolean }) {
  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      completed: 'bg-green-500/10 text-green-500',
      failed: 'bg-red-500/10 text-red-500',
      processing: 'bg-amber-500/10 text-amber-500',
      pending: isDark ? 'bg-surface-3 text-neutral-400' : 'bg-neutral-100 text-neutral-500',
    }
    return map[status] ?? map.pending
  }

  return (
    <div>
      <h3 className={cn('text-sm font-medium mb-3', isDark ? 'text-neutral-200' : 'text-neutral-700')}>Import History</h3>
      <div className={cn('rounded-xl border overflow-hidden', isDark ? 'border-white/[0.06]' : 'border-neutral-200')}>
        <table className="w-full text-xs">
          <thead>
            <tr className={isDark ? 'bg-surface-1 text-neutral-400' : 'bg-neutral-50 text-neutral-500'}>
              <th className="px-3 py-2 text-left font-medium">Source</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Docs</th>
              <th className="px-3 py-2 text-left font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className={cn('border-t', isDark ? 'border-white/[0.04]' : 'border-neutral-100')}>
                <td className={cn('px-3 py-2 capitalize', isDark ? 'text-neutral-200' : 'text-neutral-700')}>{job.source}</td>
                <td className="px-3 py-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', statusBadge(job.status))}>{job.status}</span>
                </td>
                <td className={cn('px-3 py-2', isDark ? 'text-neutral-300' : 'text-neutral-600')}>{job.processedDocs}/{job.totalDocs}</td>
                <td className={cn('px-3 py-2', isDark ? 'text-neutral-400' : 'text-neutral-500')}>{new Date(job.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
