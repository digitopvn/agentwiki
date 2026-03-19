/** App root: QueryClient, BrowserRouter, auth-gated routes */

import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from './hooks/use-auth'
import { Layout } from './components/layout/layout'
import { LoginPage } from './routes/login'
import { ProfilePage } from './routes/profile'
import { SettingsPage } from './routes/settings'
import { ApiDocsPage } from './routes/api-docs'
import { CliDocsPage } from './routes/cli-docs'
import { apiClient } from './lib/api-client'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
})

/** Wraps a route that requires authentication */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-0">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-800 border-t-brand-500" />
          <span className="text-xs text-neutral-600">Loading...</span>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

/** Public share view — read-only document accessed via share token */
function ShareView() {
  const { token } = useParams<{ token: string }>()

  interface SharedDoc {
    document: { id: string; title: string; content: string; category?: string; createdAt: string; updatedAt: string }
    shareLink: { expiresAt: string | null; accessLevel: string }
  }

  const { data, isLoading, error } = useQuery<SharedDoc>({
    queryKey: ['share', token],
    queryFn: () => apiClient.get<SharedDoc>(`/api/share/public/${token}`),
    enabled: !!token,
  })

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-0">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-800 border-t-brand-500" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-surface-0">
        <p className="text-sm text-neutral-400">This share link is invalid or has expired.</p>
        <a href="/" className="text-xs text-brand-400 hover:underline">Go to AgentWiki</a>
      </div>
    )
  }

  const { document: doc } = data

  return (
    <div className="flex h-screen flex-col bg-surface-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-8 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-brand-700">
            <span className="text-[9px] font-bold text-white">A</span>
          </div>
          <span className="text-sm font-semibold text-neutral-200">AgentWiki</span>
          <span className="text-xs text-neutral-600">· Shared document</span>
        </div>
        {doc.category && (
          <span className="rounded-full bg-surface-3 px-2.5 py-0.5 text-[11px] text-neutral-400">{doc.category}</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="mb-6 text-3xl font-bold text-neutral-100">{doc.title}</h1>
          <div className="prose prose-invert prose-sm max-w-none text-neutral-300 whitespace-pre-wrap">
            {doc.content}
          </div>
        </div>
      </div>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/share/:token" element={<ShareView />} />
      <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
      <Route path="/docs/api" element={<RequireAuth><ApiDocsPage /></RequireAuth>} />
      <Route path="/docs/cli" element={<RequireAuth><CliDocsPage /></RequireAuth>} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      />
      <Route
        path="/doc/:slug"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
