/** CLI documentation page */

import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Terminal } from 'lucide-react'
import { useAppStore } from '../stores/app-store'
import { cn } from '../lib/utils'

const CLI_SECTIONS = [
  {
    title: 'Installation',
    commands: [
      { cmd: 'npm install -g @agentwiki/cli', desc: 'Install the CLI globally' },
    ],
  },
  {
    title: 'Authentication',
    commands: [
      { cmd: 'agentwiki login --api-key aw_xxxxx', desc: 'Login with an API key' },
      { cmd: 'agentwiki login --api-key aw_xxxxx --url https://custom.domain', desc: 'Login to custom instance' },
      { cmd: 'agentwiki whoami', desc: 'Show current authenticated user' },
    ],
  },
  {
    title: 'Documents',
    commands: [
      { cmd: 'agentwiki doc list', desc: 'List all documents' },
      { cmd: 'agentwiki doc list --limit 10 --offset 0', desc: 'Paginated document list' },
      { cmd: 'agentwiki doc get <id>', desc: 'Get document by ID' },
      { cmd: 'agentwiki doc get <id> --json', desc: 'Get document as JSON' },
      { cmd: 'agentwiki doc get <id> --markdown', desc: 'Get document as markdown' },
      { cmd: 'agentwiki doc create --title "My Doc" --content "# Hello"', desc: 'Create new document' },
      { cmd: 'agentwiki doc update <id> --content "Updated content"', desc: 'Update document content' },
      { cmd: 'agentwiki doc update <id> --title "New Title"', desc: 'Rename document' },
      { cmd: 'agentwiki doc delete <id>', desc: 'Delete document (soft delete)' },
    ],
  },
  {
    title: 'Search',
    commands: [
      { cmd: 'agentwiki search "query term"', desc: 'Hybrid search (keyword + semantic)' },
      { cmd: 'agentwiki search "query" --type keyword', desc: 'Keyword-only search' },
      { cmd: 'agentwiki search "query" --type semantic', desc: 'Semantic search via embeddings' },
    ],
  },
  {
    title: 'Folders',
    commands: [
      { cmd: 'agentwiki folder list', desc: 'List folder tree' },
      { cmd: 'agentwiki folder create --name "Engineering"', desc: 'Create root folder' },
      { cmd: 'agentwiki folder create --name "Sub" --parent <parentId>', desc: 'Create subfolder' },
    ],
  },
  {
    title: 'Tags',
    commands: [
      { cmd: 'agentwiki tag list', desc: 'List all tags in workspace' },
    ],
  },
  {
    title: 'Uploads',
    commands: [
      { cmd: 'agentwiki upload <file-path>', desc: 'Upload a file to R2 storage' },
      { cmd: 'agentwiki upload <file-path> --doc-id <id>', desc: 'Upload and attach to document' },
    ],
  },
]

export function CliDocsPage() {
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
          <Terminal className="h-5 w-5 text-brand-400" />
          <h1 className={cn('text-lg font-semibold', isDark ? 'text-neutral-100' : 'text-neutral-900')}>CLI Documentation</h1>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-8 space-y-8">
        {/* Intro */}
        <div className={cn('rounded-lg border p-4 space-y-2', isDark ? 'border-white/[0.06] bg-surface-1' : 'border-neutral-200 bg-white')}>
          <p className={cn('text-sm', isDark ? 'text-neutral-300' : 'text-neutral-700')}>
            The AgentWiki CLI lets AI agents and developers manage knowledge programmatically.
          </p>
          <p className={cn('text-xs', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
            Requires an API key. Create one in Settings &gt; API Keys.
          </p>
        </div>

        {CLI_SECTIONS.map((section) => (
          <div key={section.title} className="space-y-2">
            <h2 className={cn('text-sm font-semibold', isDark ? 'text-neutral-200' : 'text-neutral-800')}>{section.title}</h2>
            <div className={cn('rounded-lg border overflow-hidden', isDark ? 'border-white/[0.06]' : 'border-neutral-200')}>
              {section.commands.map((c, i) => (
                <div
                  key={c.cmd}
                  className={cn(
                    'px-4 py-3',
                    i > 0 && (isDark ? 'border-t border-white/[0.04]' : 'border-t border-neutral-100'),
                    isDark ? 'bg-surface-1' : 'bg-white',
                  )}
                >
                  <code className={cn('block font-mono text-xs', isDark ? 'text-brand-400' : 'text-brand-600')}>
                    $ {c.cmd}
                  </code>
                  <p className={cn('mt-1 text-xs', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
                    {c.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
