/** App root: QueryClient, BrowserRouter, auth-gated routes */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from './hooks/use-auth'
import { Layout } from './components/layout/layout'
import { LoginPage } from './routes/login'
import { ProfilePage } from './routes/profile'
import { SettingsPage } from './routes/settings'
import { ApiDocsPage } from './routes/api-docs'
import { CliDocsPage } from './routes/cli-docs'
import { SearchAnalyticsPage } from './routes/search-analytics'
import { GraphPage } from './routes/graph'
import { ShareView } from './routes/share-view'
import { PublishedView } from './routes/published-view'

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

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/share/:token" element={<ShareView />} />
      <Route path="/pub/:slug" element={<PublishedView />} />
      <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
      <Route path="/docs/api" element={<RequireAuth><ApiDocsPage /></RequireAuth>} />
      <Route path="/docs/cli" element={<RequireAuth><CliDocsPage /></RequireAuth>} />
      <Route path="/settings/search-analytics" element={<RequireAuth><SearchAnalyticsPage /></RequireAuth>} />
      <Route path="/graph" element={<RequireAuth><GraphPage /></RequireAuth>} />
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
