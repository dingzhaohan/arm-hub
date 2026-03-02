import { useState, useEffect } from 'react'
import { api } from '../api'
import { useAuth } from '../contexts/AuthContext'

export default function BohrClaw() {
  const { user } = useAuth()
  const [instance, setInstance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    api.getBohrClawStatus()
      .then(data => { if (data) setInstance(data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user])

  const handleLaunch = async () => {
    setLaunching(true)
    setError(null)
    try {
      const data = await api.launchBohrClaw()
      setInstance(data)
    } catch (e) {
      setError(e.message || 'Failed to launch')
    } finally {
      setLaunching(false)
    }
  }

  // Not logged in
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">BohrClaw</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6">Sign in to launch your personal OpenClaw instance.</p>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('show-login-modal'))}
          className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
        >
          Sign In
        </button>
      </div>
    )
  }

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    )
  }

  // Instance ready — iframe embed
  if (instance && instance.status === 'ready' && instance.instance_url) {
    return (
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 -my-8" style={{ height: 'calc(100vh - 64px)' }}>
        <iframe
          src={instance.instance_url}
          title="BohrClaw"
          className="w-full h-full border-0"
          allow="clipboard-read; clipboard-write"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals"
        />
      </div>
    )
  }

  // Launch page
  return (
    <div className="max-w-xl mx-auto py-16">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">BohrClaw</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Launch your own personal OpenClaw instance on Bohrium with one click.
        </p>
      </div>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}
        <button
          onClick={handleLaunch}
          disabled={launching}
          className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {launching && (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {launching ? 'Provisioning...' : 'Launch OpenClaw'}
        </button>
        {launching && (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
            This may take a few minutes while a Bohrium node is provisioned.
          </p>
        )}
      </div>
    </div>
  )
}
