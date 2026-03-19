/** API documentation page */

import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { useAppStore } from '../stores/app-store'
import { cn } from '../lib/utils'

const API_SECTIONS = [
  {
    title: 'Authentication',
    endpoints: [
      { method: 'GET', path: '/api/auth/google', desc: 'Initiate Google OAuth login' },
      { method: 'GET', path: '/api/auth/github', desc: 'Initiate GitHub OAuth login' },
      { method: 'GET', path: '/api/auth/me', desc: 'Get current authenticated user' },
      { method: 'PATCH', path: '/api/auth/me', desc: 'Update user profile (name)' },
      { method: 'POST', path: '/api/auth/refresh', desc: 'Refresh JWT access token' },
      { method: 'POST', path: '/api/auth/logout', desc: 'Logout and revoke session' },
    ],
  },
  {
    title: 'Documents',
    endpoints: [
      { method: 'GET', path: '/api/documents', desc: 'List documents (paginated, filterable by folderId, category, tag, search)' },
      { method: 'POST', path: '/api/documents', desc: 'Create a new document' },
      { method: 'GET', path: '/api/documents/:id', desc: 'Get document by ID' },
      { method: 'GET', path: '/api/documents/by-slug/:slug', desc: 'Get document by slug' },
      { method: 'PUT', path: '/api/documents/:id', desc: 'Update document (title, content, category, accessLevel, folderId)' },
      { method: 'DELETE', path: '/api/documents/:id', desc: 'Soft-delete document' },
      { method: 'GET', path: '/api/documents/:id/versions', desc: 'Get version history' },
      { method: 'POST', path: '/api/documents/:id/versions', desc: 'Create manual version checkpoint' },
      { method: 'GET', path: '/api/documents/:id/links', desc: 'Get forward + backlinks (wikilinks)' },
    ],
  },
  {
    title: 'Folders',
    endpoints: [
      { method: 'GET', path: '/api/folders', desc: 'Get folder tree' },
      { method: 'POST', path: '/api/folders', desc: 'Create folder' },
      { method: 'PUT', path: '/api/folders/:id', desc: 'Rename or move folder' },
      { method: 'DELETE', path: '/api/folders/:id', desc: 'Delete folder and contents' },
    ],
  },
  {
    title: 'Search',
    endpoints: [
      { method: 'GET', path: '/api/search?q=query&type=hybrid|keyword|semantic', desc: 'Search documents (hybrid combines keyword + semantic)' },
    ],
  },
  {
    title: 'Tags & Categories',
    endpoints: [
      { method: 'GET', path: '/api/tags', desc: 'List all tags in workspace' },
      { method: 'GET', path: '/api/tags/categories', desc: 'List distinct document categories' },
    ],
  },
  {
    title: 'Uploads',
    endpoints: [
      { method: 'POST', path: '/api/uploads', desc: 'Upload file (multipart, max 10MB)' },
      { method: 'GET', path: '/api/uploads', desc: 'List uploaded files' },
      { method: 'DELETE', path: '/api/uploads/:id', desc: 'Delete uploaded file' },
      { method: 'GET', path: '/api/files/:key', desc: 'Serve file from R2 storage' },
    ],
  },
  {
    title: 'Sharing & Publishing',
    endpoints: [
      { method: 'POST', path: '/api/share/links', desc: 'Create share link for document' },
      { method: 'GET', path: '/api/share/links/:documentId', desc: 'List share links for document' },
      { method: 'DELETE', path: '/api/share/links/:id', desc: 'Revoke share link' },
      { method: 'GET', path: '/api/share/public/:token', desc: 'Access shared document (no auth)' },
      { method: 'POST', path: '/api/share/publish/:documentId', desc: 'Publish document as public page' },
    ],
  },
  {
    title: 'Members',
    endpoints: [
      { method: 'GET', path: '/api/members', desc: 'List workspace members (admin only)' },
      { method: 'PATCH', path: '/api/members/:id', desc: 'Update member role (admin only)' },
      { method: 'DELETE', path: '/api/members/:id', desc: 'Remove member (admin only)' },
    ],
  },
  {
    title: 'API Keys',
    endpoints: [
      { method: 'GET', path: '/api/keys', desc: 'List API keys' },
      { method: 'POST', path: '/api/keys', desc: 'Create API key (scoped)' },
      { method: 'DELETE', path: '/api/keys/:id', desc: 'Revoke API key' },
    ],
  },
  {
    title: 'Graph',
    endpoints: [
      { method: 'GET', path: '/api/graph', desc: 'Get document graph (nodes + edges for visualization)' },
    ],
  },
]

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-green-500/15 text-green-400',
  POST: 'bg-blue-500/15 text-blue-400',
  PUT: 'bg-amber-500/15 text-amber-400',
  PATCH: 'bg-amber-500/15 text-amber-400',
  DELETE: 'bg-red-500/15 text-red-400',
}

export function ApiDocsPage() {
  const { theme } = useAppStore()
  const navigate = useNavigate()
  const isDark = theme === 'dark'

  return (
    <div className={cn('min-h-screen', isDark ? 'bg-surface-0' : 'bg-neutral-50')}>
      {/* Header */}
      <div className={cn('border-b px-6 py-4', isDark ? 'border-white/[0.06]' : 'border-neutral-200')}>
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button onClick={() => navigate('/')} className={cn('cursor-pointer rounded-lg p-1.5', isDark ? 'hover:bg-surface-3 text-neutral-400' : 'hover:bg-neutral-100 text-neutral-500')}>
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className={cn('text-lg font-semibold', isDark ? 'text-neutral-100' : 'text-neutral-900')}>API Documentation</h1>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-8 space-y-8">
        <div className={cn('rounded-lg border p-4', isDark ? 'border-white/[0.06] bg-surface-1' : 'border-neutral-200 bg-white')}>
          <p className={cn('text-sm', isDark ? 'text-neutral-300' : 'text-neutral-700')}>
            Base URL: <code className={cn('rounded px-1.5 py-0.5 font-mono text-xs', isDark ? 'bg-surface-3 text-brand-400' : 'bg-neutral-100 text-brand-600')}>https://agentwiki.cc</code>
          </p>
          <p className={cn('mt-2 text-xs', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
            Authentication: JWT cookie (web) or API key header (<code>Authorization: Bearer aw_xxx</code>)
          </p>
        </div>

        {API_SECTIONS.map((section) => (
          <div key={section.title} className="space-y-2">
            <h2 className={cn('text-sm font-semibold', isDark ? 'text-neutral-200' : 'text-neutral-800')}>{section.title}</h2>
            <div className={cn('rounded-lg border overflow-hidden', isDark ? 'border-white/[0.06]' : 'border-neutral-200')}>
              {section.endpoints.map((ep, i) => (
                <EndpointRow key={`${ep.method}-${ep.path}`} endpoint={ep} isDark={isDark} hasBorder={i > 0} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EndpointRow({ endpoint, isDark, hasBorder }: { endpoint: { method: string; path: string; desc: string }; isDark: boolean; hasBorder: boolean }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(endpoint.path)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 group',
        hasBorder && (isDark ? 'border-t border-white/[0.04]' : 'border-t border-neutral-100'),
        isDark ? 'bg-surface-1' : 'bg-white',
      )}
    >
      <span className={cn('inline-flex w-14 justify-center rounded px-1.5 py-0.5 font-mono text-[10px] font-bold', METHOD_COLORS[endpoint.method] ?? '')}>
        {endpoint.method}
      </span>
      <code className={cn('font-mono text-xs flex-1', isDark ? 'text-neutral-300' : 'text-neutral-700')}>{endpoint.path}</code>
      <span className={cn('text-xs hidden sm:block', isDark ? 'text-neutral-500' : 'text-neutral-400')}>{endpoint.desc}</span>
      <button onClick={handleCopy} className="opacity-0 group-hover:opacity-100 cursor-pointer rounded p-1 text-neutral-500 hover:text-neutral-300 transition-opacity">
        {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  )
}
