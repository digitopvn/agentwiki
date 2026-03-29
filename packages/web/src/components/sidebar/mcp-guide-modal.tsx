/** Modal showing MCP server connection configs for Claude Desktop, Claude Code, Cursor */

import { useState } from 'react'
import { X, Copy, Check, ExternalLink, Plug } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../stores/app-store'
import { cn } from '../../lib/utils'

interface McpGuideModalProps {
  open: boolean
  onClose: () => void
}

type TabId = 'claude-desktop' | 'claude-code' | 'cursor'

const MCP_URL = 'https://mcp.agentwiki.cc/sse'

const TABS: { id: TabId; label: string; configPath: string; steps: string[] }[] = [
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    configPath: '~/Library/Application Support/Claude/claude_desktop_config.json',
    steps: [
      'Open Claude Desktop → Settings → Developer → Edit Config',
      'Paste the JSON below into your config file',
      'Replace <YOUR_API_KEY> with your AgentWiki API key',
      'Restart Claude Desktop',
    ],
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    configPath: '.mcp.json (project root)',
    steps: [
      'Create a .mcp.json file in your project root',
      'Paste the JSON below',
      'Replace <YOUR_API_KEY> with your AgentWiki API key',
    ],
  },
  {
    id: 'cursor',
    label: 'Cursor',
    configPath: '.cursor/mcp.json',
    steps: [
      'Open Cursor → Settings → MCP → Add new MCP server',
      'Or create .cursor/mcp.json in your project root',
      'Paste the JSON below and replace <YOUR_API_KEY>',
    ],
  },
]

function buildSnippet(): string {
  return JSON.stringify(
    {
      mcpServers: {
        agentwiki: {
          url: MCP_URL,
          headers: { Authorization: 'Bearer <YOUR_API_KEY>' },
        },
      },
    },
    null,
    2,
  )
}

export function McpGuideModal({ open, onClose }: McpGuideModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('claude-desktop')
  const [copied, setCopied] = useState(false)
  const { theme } = useAppStore()
  const navigate = useNavigate()
  const isDark = theme === 'dark'

  if (!open) return null

  const tab = TABS.find((t) => t.id === activeTab)!
  const snippet = buildSnippet()

  const handleCopy = async () => {
    await navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleApiKeyLink = () => {
    onClose()
    navigate('/settings?tab=api-keys')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className={cn(
          'relative w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl',
          isDark ? 'border-white/[0.08] bg-surface-2' : 'border-neutral-200 bg-white',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={cn('flex items-center justify-between px-5 py-4 border-b', isDark ? 'border-white/[0.06]' : 'border-neutral-200')}>
          <div className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-brand-400" />
            <h2 className={cn('text-sm font-semibold', isDark ? 'text-neutral-100' : 'text-neutral-900')}>
              Connect MCP Server
            </h2>
          </div>
          <button
            onClick={onClose}
            className={cn('cursor-pointer rounded-md p-1', isDark ? 'text-neutral-500 hover:text-neutral-300' : 'text-neutral-400 hover:text-neutral-600')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className={cn('flex gap-1 px-5 pt-4 pb-2')}>
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => { setActiveTab(id); setCopied(false) }}
              className={cn(
                'cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                activeTab === id
                  ? 'bg-brand-600 text-white'
                  : isDark
                    ? 'text-neutral-400 hover:bg-surface-3 hover:text-neutral-200'
                    : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="px-5 pb-5 pt-2 space-y-3">
          {/* Config path */}
          <p className={cn('text-xs', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
            Config: <code className={cn('rounded px-1 py-0.5 text-[11px]', isDark ? 'bg-surface-3 text-neutral-300' : 'bg-neutral-100 text-neutral-600')}>{tab.configPath}</code>
          </p>

          {/* Steps */}
          <ol className="space-y-1">
            {tab.steps.map((step, i) => (
              <li key={i} className={cn('flex gap-2 text-xs', isDark ? 'text-neutral-300' : 'text-neutral-600')}>
                <span className={cn('shrink-0 font-medium', isDark ? 'text-neutral-500' : 'text-neutral-400')}>{i + 1}.</span>
                {step}
              </li>
            ))}
          </ol>

          {/* Code block */}
          <div className="relative">
            <pre
              className={cn(
                'overflow-x-auto rounded-lg border p-3 text-[11px] leading-relaxed font-mono',
                isDark ? 'border-white/[0.06] bg-surface-3 text-neutral-200' : 'border-neutral-200 bg-neutral-50 text-neutral-700',
              )}
            >
              {snippet}
            </pre>
            <button
              onClick={handleCopy}
              className={cn(
                'absolute top-2 right-2 cursor-pointer rounded-md p-1.5 transition-colors',
                copied
                  ? 'text-green-400'
                  : isDark
                    ? 'text-neutral-500 hover:bg-surface-2 hover:text-neutral-300'
                    : 'text-neutral-400 hover:bg-white hover:text-neutral-600',
              )}
              title="Copy to clipboard"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>

          {/* API Key link */}
          <button
            onClick={handleApiKeyLink}
            className={cn(
              'flex items-center gap-1.5 cursor-pointer text-xs font-medium transition-colors',
              isDark ? 'text-brand-400 hover:text-brand-300' : 'text-brand-600 hover:text-brand-500',
            )}
          >
            <ExternalLink className="h-3 w-3" />
            Create or manage API Keys
          </button>
        </div>
      </div>
    </div>
  )
}
