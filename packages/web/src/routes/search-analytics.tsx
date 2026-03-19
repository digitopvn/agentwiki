/** Search Analytics Dashboard — admin-only page showing search metrics */

import { useState } from 'react'
import { BarChart3, Search, AlertCircle, MousePointerClick, TrendingUp } from 'lucide-react'
import { useSearchAnalytics } from '../hooks/use-search-analytics'
import { useAppStore } from '../stores/app-store'
import { cn } from '../lib/utils'

export function SearchAnalyticsPage() {
  const [period, setPeriod] = useState<'7d' | '30d'>('7d')
  const { data, isLoading, error } = useSearchAnalytics(period)
  const { theme } = useAppStore()
  const isDark = theme === 'dark'

  if (error) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className={cn('text-sm', isDark ? 'text-red-400' : 'text-red-600')}>
          {(error as Error).message?.includes('403') ? 'Admin access required' : 'Failed to load analytics'}
        </p>
      </div>
    )
  }

  const cardClass = cn(
    'rounded-xl border p-5',
    isDark ? 'border-white/[0.08] bg-surface-2' : 'border-neutral-200 bg-white',
  )
  const headingClass = cn('text-sm font-semibold', isDark ? 'text-neutral-200' : 'text-neutral-800')
  const subClass = cn('text-xs', isDark ? 'text-neutral-500' : 'text-neutral-400')
  const cellClass = cn('text-sm', isDark ? 'text-neutral-300' : 'text-neutral-700')

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className={cn('h-5 w-5', isDark ? 'text-brand-400' : 'text-brand-600')} />
          <h1 className={cn('text-lg font-semibold', isDark ? 'text-neutral-100' : 'text-neutral-900')}>
            Search Analytics
          </h1>
        </div>

        {/* Period toggle */}
        <div className={cn('flex rounded-lg border p-0.5', isDark ? 'border-white/[0.08]' : 'border-neutral-200')}>
          {(['7d', '30d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                period === p
                  ? 'bg-brand-600 text-white'
                  : isDark
                    ? 'text-neutral-400 hover:text-neutral-200'
                    : 'text-neutral-500 hover:text-neutral-700',
              )}
            >
              {p === '7d' ? '7 days' : '30 days'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className={cn('py-12 text-center text-sm', subClass)}>Loading analytics...</div>
      ) : data ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <MetricCard
              icon={<Search className="h-4 w-4" />}
              label="Total Searches"
              value={data.totalSearches.toLocaleString()}
              isDark={isDark}
              cardClass={cardClass}
            />
            <MetricCard
              icon={<MousePointerClick className="h-4 w-4" />}
              label="Click-Through Rate"
              value={`${data.clickThroughRate}%`}
              isDark={isDark}
              cardClass={cardClass}
            />
            <MetricCard
              icon={<AlertCircle className="h-4 w-4" />}
              label="Zero-Result Queries"
              value={data.zeroResultQueries.length.toString()}
              isDark={isDark}
              cardClass={cardClass}
            />
          </div>

          {/* Top Queries */}
          <div className={cardClass}>
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className={cn('h-4 w-4', isDark ? 'text-brand-400' : 'text-brand-600')} />
              <h2 className={headingClass}>Top Queries</h2>
            </div>
            {data.topQueries.length === 0 ? (
              <p className={subClass}>No search data yet</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className={subClass}>
                    <th className="pb-2 text-left font-medium">Query</th>
                    <th className="pb-2 text-right font-medium">Count</th>
                    <th className="pb-2 text-right font-medium">Avg Results</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topQueries.slice(0, 15).map((q, i) => (
                    <tr key={i} className={cn('border-t', isDark ? 'border-white/[0.04]' : 'border-neutral-100')}>
                      <td className={cn('py-1.5', cellClass)}>{q.query}</td>
                      <td className={cn('py-1.5 text-right', cellClass)}>{q.count}</td>
                      <td className={cn('py-1.5 text-right', cellClass)}>{q.avgResults}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Zero-Result Queries */}
          {data.zeroResultQueries.length > 0 && (
            <div className={cardClass}>
              <div className="mb-3 flex items-center gap-2">
                <AlertCircle className={cn('h-4 w-4 text-amber-500')} />
                <h2 className={headingClass}>Content Gaps (Zero-Result Queries)</h2>
              </div>
              <p className={cn('mb-3 text-xs', subClass)}>
                Users searched for these terms but found nothing — consider creating docs for them.
              </p>
              <div className="flex flex-wrap gap-2">
                {data.zeroResultQueries.map((q, i) => (
                  <span
                    key={i}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs',
                      isDark ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-700',
                    )}
                  >
                    {q.query}
                    <span className="opacity-50">×{q.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Search Type Distribution */}
          {data.searchTypeDistribution.length > 0 && (
            <div className={cardClass}>
              <h2 className={cn('mb-3', headingClass)}>Search Type Distribution</h2>
              <div className="flex gap-4">
                {data.searchTypeDistribution.map((t) => (
                  <div key={t.type} className="flex items-center gap-2">
                    <div
                      className={cn(
                        'h-2.5 w-2.5 rounded-full',
                        t.type === 'hybrid'
                          ? 'bg-brand-500'
                          : t.type === 'keyword'
                            ? 'bg-emerald-500'
                            : 'bg-purple-500',
                      )}
                    />
                    <span className={cellClass}>
                      {t.type}: {t.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  isDark,
  cardClass,
}: {
  icon: React.ReactNode
  label: string
  value: string
  isDark: boolean
  cardClass: string
}) {
  return (
    <div className={cardClass}>
      <div className="flex items-center gap-2">
        <span className={isDark ? 'text-neutral-500' : 'text-neutral-400'}>{icon}</span>
        <span className={cn('text-xs', isDark ? 'text-neutral-500' : 'text-neutral-400')}>{label}</span>
      </div>
      <p className={cn('mt-1 text-2xl font-bold', isDark ? 'text-neutral-100' : 'text-neutral-900')}>{value}</p>
    </div>
  )
}
