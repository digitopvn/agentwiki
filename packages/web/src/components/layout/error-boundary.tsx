/** Generic React Error Boundary — catches render errors and shows fallback UI */

import { Component, type ReactNode, type ErrorInfo } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Rendered when an error is caught */
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
            <p className="text-xs text-red-400">Something went wrong</p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="rounded-md bg-neutral-800 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
            >
              Try again
            </button>
          </div>
        )
      )
    }
    return this.props.children
  }
}
