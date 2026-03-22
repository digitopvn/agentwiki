/** Extraction status badge — shows processing state for uploaded files */

import { Loader2, Check, X, Minus, Clock } from 'lucide-react'
import { cn } from '../../lib/utils'

const STATUS_CONFIG = {
  pending: { icon: Clock, label: 'Pending', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  processing: { icon: Loader2, label: 'Extracting...', color: 'text-blue-400', bg: 'bg-blue-400/10', spin: true },
  completed: { icon: Check, label: 'Indexed', color: 'text-green-400', bg: 'bg-green-400/10' },
  failed: { icon: X, label: 'Failed', color: 'text-red-400', bg: 'bg-red-400/10' },
  unsupported: { icon: Minus, label: 'N/A', color: 'text-neutral-500', bg: 'bg-neutral-500/10' },
} as const

export function ExtractionBadge({ status }: { status: string | null }) {
  const config = STATUS_CONFIG[(status as keyof typeof STATUS_CONFIG) ?? 'pending'] ?? STATUS_CONFIG.pending
  const Icon = config.icon

  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium', config.bg, config.color)}>
      <Icon className={cn('h-2.5 w-2.5', 'spin' in config && config.spin && 'animate-spin')} />
      {config.label}
    </span>
  )
}
