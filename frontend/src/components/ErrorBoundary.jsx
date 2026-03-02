import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Something went wrong</h1>
            <p className="text-gray-500 dark:text-gray-400 mb-6">An unexpected error occurred.</p>
            {this.state.error && (
              <pre className="text-left text-xs text-red-500 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg mb-4 max-w-lg mx-auto overflow-auto">
                {this.state.error.toString()}
              </pre>
            )}
            <div className="flex justify-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 text-sm"
              >
                Refresh Page
              </button>
              <a
                href="/"
                className="px-5 py-2.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg font-medium text-sm"
              >
                Back to Home
              </a>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
